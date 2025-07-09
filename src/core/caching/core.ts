import { NullableType, Optional, Supplier } from '../types';
import { When } from '../validation';

/**
 * Retrieves the moment in milliseconds after a specific interval.
 */
export const MomentAfter = {
  /**
   * @param n number of milliseconds later.
   */
  ms: (n: number) => Date.now() + n,
  /**
   * @param n number of seconds later.
   */
  sec: (n: number) => MomentAfter.ms(n * 1e3),
  /**
   * @param n number of minutes later.
   */
  min: (n: number) => MomentAfter.sec(n * 60),
  /**
   * @param n number of hours later.
   */
  hour: (n: number) => MomentAfter.min(n * 60),
  /**
   * @param n number of days later.
   */
  day: (n: number) => MomentAfter.hour(n * 24),
};

/**
 * Cached value's options.
 */
export interface CacheOptions {
  /**
   * Time when the cache is expired (in milliseconds).
   */
  expiry: number;
  /**
   * Cached value's version.
   */
  version?: number | string;
}

/**
 * A function that generates a cache key from given values.
 */
export type CacheKeyGenerator<S extends any[] = any[]> = (...args: S) => string;

/**
 * An object that contains cached key.
 */
export class CacheKey<S extends any[] = any[]> {
  /**
   * Cached key.
   */
  public readonly value: string;

  constructor(
    public readonly generator: CacheKeyGenerator,
    public readonly args: S
  ) {
    this.value = generator(...args);
  }
}

/**
 * A validator used in {@link When} to specify whether a {@link CacheStore} is enabled.
 */
export function cacheEnabled() {
  return !!this && (this as CacheStore).enabled;
}

/**
 * An object that contains cached value and its caching status (hit or miss).
 */
export class CacheValue<T> {
  /**
   * An empty cache-miss {@link CacheValue}.
   */
  static readonly NONE = new CacheValue(undefined, false);

  constructor(
    /**
     * Cached value.
     */
    public readonly value?: NullableType<T>,
    /**
     * Is cache hit?
     */
    public readonly hit?: boolean,
    /**
     * Cached value's version.
     */
    public readonly version?: number | string
  ) {}
}

/**
 * Where we stores our caches.
 */
export abstract class CacheStore<O extends CacheOptions = CacheOptions> {
  protected _enabled: boolean;

  /**
   * Indicates whether the {@link CacheStore} is enabled.
   * All functionalities only work when it's enabled.
   */
  get enabled() {
    return this._enabled;
  }

  /**
   * Enables the {@link CacheStore}.
   */
  enable() {
    this._enabled = true;
  }

  /**
   * Disables the {@link CacheStore}.
   */
  disable() {
    this._enabled = false;
  }

  /**
   * Retrieves cached value for given key.
   * @param key the key.
   * @returns a {@link CacheValue} that specifies cache hit or cache miss.
   */
  abstract get<T>(
    key: string,
    version?: number | string
  ): Promise<CacheValue<T>>;
  /**
   * Adds a cached value into the store for given key.
   * @param key the key.
   * @param value the cached value.
   * @param options the cached value's options.
   */
  abstract set<T>(key: string, value: T, options?: O): Promise<void>;
  /**
   * Deletes cached value from the store for given key.
   * @param key the key.
   * @returns the cached value if it exists in the store.
   */
  abstract delete<T>(key: string): Promise<CacheValue<T>>;
  /**
   * Returns all keys that match a given pattern.
   * @param pattern the pattern.
   */
  abstract keys(pattern: string): Promise<string[]>;
  /**
   * Returns total cached values that match a given key pattern.
   * @param pattern the pattern.
   */
  abstract count(pattern: string): Promise<number>;
}

/**
 * A basic implementation for {@link CacheStore} that stores all caches
 * in an internal {@link Map} and does not support caches' versions.
 */
export class LocalCacheStore extends CacheStore<CacheOptions> {
  private readonly cache: Map<
    string,
    {
      value: any;
      options: CacheOptions;
    }
  >;
  /**
   * To periodically (every 100 millisecond) remove expired caches.
   */
  private readonly cleaner: NodeJS.Timer;

  constructor() {
    super();
    this.cache = new Map();
    this.cleaner = setInterval(async () => {
      await Promise.all([
        ...this.cache.keys().map((key) => {
          try {
            this.get(key);
          } catch {}
        }),
      ]);
    }, 100); // 0.1s
  }

  /**
   * Starts removing expired caches.
   */
  protected clean() {
    this.cleaner.refresh();
  }

  @When(cacheEnabled)
  override async get<T>(key: string): Promise<CacheValue<T>> {
    const cacheValue = this.cache.get(key);
    if (Optional(cacheValue).present) {
      const now = Date.now();
      const { value, options = { expiry: now } } = cacheValue;
      const expiry = options.expiry;
      if (expiry >= now) {
        return new CacheValue(value, true);
      }
    }
    this.cache.delete(key);
    return new CacheValue();
  }

  @When(cacheEnabled)
  override async set<T>(
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<void> {
    this.cache.set(key, {
      value,
      options: {
        expiry: options?.expiry ?? MomentAfter.min(5),
        version: options?.version,
      },
    });
  }

  @When(cacheEnabled)
  override async delete<T>(key: string): Promise<CacheValue<T>> {
    const value = await this.get<T>(key);
    this.cache.delete(key);
    return value;
  }

  @When(cacheEnabled)
  override async keys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.cache.keys());
    const regex = Optional(pattern)
      .map((p) =>
        p
          .replace(/([.+^=!:${}()|[\]\\])/g, '\\$1') // escape regex specials
          .replace(/\*/g, '.*') // * -> .*
          .replace(/\?/g, '.') // ? -> .
          .replace(/\[!(.*)\]/g, '[^$1]') // [!] -> [^]
          .replace(/\[(.*)\]/g, '[$1]')
      )
      .map((re) => new RegExp(`^${re}$`))
      .get();
    return keys.filter((k) => regex.test(k));
  }

  @When(cacheEnabled)
  override async count(pattern: string): Promise<number> {
    return (await this.keys(pattern)).length;
  }
}

/**
 * Simply generates a text for cached key by joining all passed values
 * together with a hash (`#`) character.
 */
function SimpleCacheKeyGenerator(...args: any[]) {
  return [...args].join('#');
}

export type RenewableCacheOptions = CacheOptions & {
  /**
   * To support refreshing the cache automatically not not.
   */
  renewable?: boolean;
};

/**
 * Marks a class method as be able to cached.
 */
export function Cachable<O extends RenewableCacheOptions>({
  key,
  store,
  options,
  events = {},
}: {
  /**
   * Cache key or a function to generate cache key.
   */
  key?: string | CacheKeyGenerator;
  /**
   * A {@link CacheStore} type.
   */
  store?: CacheStore<O> | Class<CacheStore<O>> | Supplier<CacheStore<O>>;
  /**
   * Options for {@link CacheStore}.
   */
  options?: O | (() => O);
  /**
   * Caching event handlers.
   */
  events?: Partial<{
    /**
     * When cache misses.
     */
    onMiss: (cacheKey: CacheKey, cacheValue: CacheValue<any>) => void;
    /**
     * When cache hits.
     */
    onHit: (cacheKey: CacheKey, cacheValue: CacheValue<any>) => void;
  }>;
} = {}) {
  const renewers = {} as Record<string, NodeJS.Timeout>;
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const generateKey = Optional(key).empty
      ? SimpleCacheKeyGenerator
      : key instanceof Function
        ? key
        : () => key;
    const className = target.constructor.name;
    const func = descriptor.value;
    const useStore = (() => {
      let instance: CacheStore<O> = undefined;
      return async function () {
        if (instance === undefined) {
          if (store instanceof CacheStore) {
            instance = store;
          } else if (store instanceof Function) {
            instance = (store as Function)();
            instance = instance instanceof Promise ? await instance : instance;
          } else {
            instance = new ((store as Class<CacheStore<O>>) ??
              LocalCacheStore)();
          }
        }
        return instance;
      };
    })();
    const { onMiss, onHit } = events ?? {};
    const cachable = async function (...args: any[]) {
      const cacheStore = await useStore();
      if (!cacheStore.enabled) {
        return func.bind(this)(...args);
      }
      const cacheKey = new CacheKey(generateKey, [
        className,
        func.name,
        ...args,
      ]);
      const cacheOptions = options instanceof Function ? options() : options;
      const renew = async () => {
        const value = func.bind(this)(...args);
        const newValue = value instanceof Promise ? await value : value;
        await cacheStore.set(cacheKey.value, newValue, cacheOptions);
        return newValue;
      };
      if (cacheOptions?.renewable && cacheOptions?.expiry) {
        const renewer = renewers[cacheKey.value];
        if (!renewer) {
          const delay = cacheOptions.expiry - Date.now();
          renewers[cacheKey.value] = setInterval(renew, delay);
        }
      }
      const cacheValue = await cacheStore.get<any>(cacheKey.value);
      if (cacheValue.hit) {
        try {
          return cacheValue.value;
        } finally {
          onHit?.(cacheKey, cacheValue);
        }
      }
      try {
        return renew();
      } finally {
        onMiss?.(cacheKey, cacheValue);
      }
    };
    descriptor.value = cachable;
  };
}
