import { Callable, notImplementedYet } from '../types';

/**
 * Options for locking.
 */
export type LockOptions = {
  /**
   * Timeout to wait for the lock acquisition (in milliseconds).
   * If not set, the lock attempt will not wait and return immediately.
   */
  timeout?: number;
  /**
   * Time-to-live of the lock (in milliseconds).
   */
  ttl?: number;
  /**
   * Lock author/authorization (who creates the lock).
   * If provided, only the same author can unlock it.
   */
  auth?: string;
};

/**
 * Options for unlocking.
 */
export type UnlockOptions = {
  /**
   * Authorization to unlock. Must match the author who created the lock.
   */
  auth?: string;
};

/**
 * Supports locking by managed keys.
 */
export class Lock<
  O extends LockOptions = LockOptions,
  U extends UnlockOptions = UnlockOptions,
> extends Callable<Promise<boolean>> {
  protected override async _(key: string, options?: O): Promise<boolean> {
    return this.lock(key, options);
  }

  /**
   * Locks a specific key.
   * @param key the key.
   * @param options the lock options.
   * @returns `true` if the key is locked successfully; otherwise, `false`.
   */
  async lock(key: string, options?: O): Promise<boolean> {
    throw notImplementedYet();
  }

  /**
   * Unlocks a specific key.
   * @param key the key.
   * @param options the unlock options.
   * @returns `true` if the key is unlocked successfully; otherwise, `false`.
   */
  async unlock(key: string, options?: U): Promise<boolean> {
    throw notImplementedYet();
  }

  /**
   * Checks if a specific key is locked or not.
   * @param key the key.
   * @returns `true` if the key is locked; otherwise, `false`.
   */
  async locked(key: string): Promise<boolean> {
    throw notImplementedYet();
  }
}

const DEFAULT_RETRY_INTERVAL = 50; // 50ms between retries

/**
 * A simple in-memory {@link Lock}.
 *
 * Features:
 * - Author-based unlock: If a lock is created with an author, only the same
 *   author can release it. If no author is provided, anyone can unlock.
 * - Wait with timeout: Caller can wait for a lock to be released by specifying
 *   a timeout in the lock options.
 */
export class SimpleLock extends Lock {
  /** Stores lock author (empty string means no author). */
  private readonly locks = new Map<string, string>();

  /**
   * Sleeps for the specified duration.
   * @param ms duration in milliseconds.
   */
  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Tries to acquire the lock once (no waiting).
   * @param key the key to lock.
   * @param auth optional author identifier.
   * @returns `true` if acquired; otherwise, `false`.
   */
  private tryAcquire(key: string, auth?: string) {
    if (this.locks.has(key)) {
      return false;
    }
    // Store author or empty string if no author
    this.locks.set(key, auth ?? '');
    return true;
  }

  override async lock(key: string, options?: LockOptions) {
    const timeout = options?.timeout;
    const auth = options?.auth;

    // First attempt
    if (this.tryAcquire(key, auth)) {
      return true;
    }

    // If no timeout specified, return immediately
    if (!timeout || timeout <= 0) {
      return false;
    }

    // Wait and retry until timeout
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.sleep(DEFAULT_RETRY_INTERVAL);

      if (this.tryAcquire(key, auth)) {
        return true;
      }
    }

    return false;
  }

  override async unlock(key: string, options?: UnlockOptions) {
    const auth = options?.auth;
    const lockValue = this.locks.get(key);

    // Lock doesn't exist
    if (lockValue === undefined) {
      return false;
    }

    // Check author authorization
    // If lock has an author (non-empty value), verify it matches
    if (lockValue !== '' && lockValue !== auth) {
      return false;
    }

    this.locks.delete(key);
    return true;
  }

  override async locked(key: string) {
    return this.locks.has(key);
  }

  async onStop() {
    this.locks.clear();
  }
}

/**
 * Lock key containing the generated key value and original arguments.
 */
export class LockKey<S extends any[] = any[]> {
  readonly value: string;
  readonly args: S;

  constructor(generator: LockKeyGenerator<S>, args: S) {
    this.args = args;
    this.value = generator(...args);
  }
}

/**
 * Function that generates a lock key from method arguments.
 */
export type LockKeyGenerator<S extends any[] = any[]> = (...args: S) => string;

/**
 * Default lock key generator.
 * Generates key from class name, method name, and JSON-stringified arguments.
 */
export const SimpleLockKeyGenerator: LockKeyGenerator = (
  className: string,
  methodName: string,
  ...args: any[]
) => {
  const argsKey = args.length > 0 ? `:${JSON.stringify(args)}` : '';
  return `${className}:${methodName}${argsKey}`;
};

/**
 * Class type helper.
 */
type Class<T> = new (...args: any[]) => T;

/**
 * Supplier function type.
 */
type Supplier<T> = () => T | Promise<T>;

/**
 * Optional value wrapper.
 */
class Optional<T> {
  constructor(private readonly value: T) {}

  static of<T>(value: T) {
    return new Optional(value);
  }

  get empty() {
    return this.value === undefined || this.value === null;
  }
}

/**
 * Error thrown when lock acquisition times out.
 */
export class LockTimeoutError extends Error {
  constructor(key: string, timeout: number) {
    super(`Lock acquisition timed out for key "${key}" after ${timeout}ms`);
    this.name = 'LockTimeoutError';
  }
}

/**
 * Options for the Lockable decorator.
 */
export type LockableOptions<O extends LockOptions = LockOptions> = {
  /**
   * Lock key or a function to generate lock key.
   */
  key?: string | LockKeyGenerator;
  /**
   * A {@link Lock} instance, class, or supplier function.
   */
  lock?: Lock<O> | Class<Lock<O>> | Supplier<Lock<O>>;
  /**
   * Lock options or a function that returns lock options.
   */
  options?: O | (() => O);
  /**
   * Event handlers for lock lifecycle.
   */
  events?: Partial<{
    /**
     * Called when lock is acquired.
     */
    onAcquired: (lockKey: LockKey) => void;
    /**
     * Called when lock is released.
     */
    onReleased: (lockKey: LockKey) => void;
    /**
     * Called when lock acquisition times out.
     */
    onTimeout: (lockKey: LockKey, timeout: number) => void;
  }>;
};

/**
 * A method decorator that ensures only one execution at a time.
 * Other calls will wait until the lock is released or timeout.
 *
 * @param options Lockable options including key generator, lock instance, and options.
 * @returns Method decorator.
 *
 * @example
 * ```typescript
 * class MyService {
 *   @Lockable({ options: { timeout: 5000, ttl: 30000 } })
 *   async processOrder(orderId: string) {
 *     // Only one call can execute at a time
 *   }
 * }
 * ```
 */
export function Lockable<O extends LockOptions = LockOptions>({
  key,
  lock,
  options,
  events = {},
}: LockableOptions<O> = {}) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const generateKey = Optional.of(key).empty
      ? SimpleLockKeyGenerator
      : key instanceof Function
        ? key
        : () => key as string;

    const className = target.constructor.name;
    const func = descriptor.value;

    // Lazy lock instance resolution
    const useLock = (() => {
      let instance: Lock<O> | undefined = undefined;
      return async function () {
        if (instance === undefined) {
          if (lock instanceof Lock) {
            instance = lock;
          } else if (lock instanceof Function) {
            const result = (lock as Function)();
            instance = result instanceof Promise ? await result : result;
          } else {
            instance = new SimpleLock() as Lock<O>;
          }
        }
        return instance;
      };
    })();

    const { onAcquired, onReleased, onTimeout } = events;

    const lockable = async function (this: any, ...args: any[]) {
      const lockInstance = await useLock();
      const lockKey = new LockKey(generateKey, [className, func.name, ...args]);
      const lockOptions = options instanceof Function ? options() : options;

      // Try to acquire the lock
      const acquired = await lockInstance.lock(lockKey.value, lockOptions);

      if (!acquired) {
        const timeout = lockOptions?.timeout ?? 0;
        onTimeout?.(lockKey, timeout);
        throw new LockTimeoutError(lockKey.value, timeout);
      }

      onAcquired?.(lockKey);

      try {
        // Execute the original method
        const result = func.apply(this, args);
        return result instanceof Promise ? await result : result;
      } finally {
        // Always release the lock
        await lockInstance.unlock(lockKey.value, {
          auth: lockOptions?.auth,
        } as UnlockOptions);
        onReleased?.(lockKey);
      }
    };

    descriptor.value = lockable;
  };
}
