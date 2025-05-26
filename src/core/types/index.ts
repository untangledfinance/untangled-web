const ClassSymbol = Symbol.for('__class__');

export type Supplier<V> = () => V;

export type NullableType<V> = V | undefined | null;

export type NullableParseOptions<V> = {
  /**
   * Values that are considered as `null`.
   */
  null: NullableType<V>[] | NullableType<V>;
};

/**
 * An nullable value which can be either `null` or `undefined`.
 */
class Nullable<V> {
  /**
   * Thrown when we attempt to retrieve a nullable value.
   */
  public static NullPointerError = class extends Error {};

  /**
   * Creates a new nullable instance of a given value.
   * @param value the value.
   */
  public static of<M>(value: NullableType<M>) {
    return new this(value);
  }

  /**
   * Creates an object that contains a nullable value.
   * @param value the value.
   * @param nulls all values that are considered as `null`.
   */
  constructor(
    private readonly value: NullableType<V>,
    private readonly nulls?: NullableType<V>[]
  ) {
    this.nulls = nulls?.length ? nulls : [null, undefined];
  }

  /**
   * Checks if underlying value is nullable or not.
   */
  get empty() {
    return this.nulls.includes(this.value);
  }

  /**
   * Returns `true` if underlying value is not nullable.
   */
  get present() {
    return !this.empty;
  }

  /**
   * Uses a converter on existing nullable value.
   * @param mapper the converter.
   * @returns new object that contains converted nullable value.
   */
  map<T>(mapper: (v: V) => T) {
    if (this.empty) {
      return new Nullable<T>(null);
    }
    return new Nullable(mapper(this.value));
  }

  /**
   * Applies a filter only if the value is not null;
   * otherwise, returns new object that contains null value.
   */
  filter(predicate: (v: V) => boolean) {
    if (this.empty || !predicate(this.value)) {
      return new Nullable<V>(null);
    }
    return this;
  }

  /**
   * Returns underlying value only if it's not nullable;
   * otherwise, throws a {@link Nullable.NullPointerError}.
   */
  get() {
    if (this.empty) {
      throw new Nullable.NullPointerError('null');
    }
    return this.value;
  }

  /**
   * Executes an action if underlying value is not nullable.
   * @param action the action.
   */
  then(action: (v: V) => void) {
    if (this.present) {
      action(this.value);
    }
  }

  /**
   * Returns underlying value ({@link get}) and executes an action ({@link then})
   * if the value is not nullable.
   * @param action the action.
   */
  getAndThen(action: (v: V) => void) {
    setImmediate(() => this.then(action));
    return this.get();
  }

  /**
   * Deeply queries in underlying value if the value is not nullable.
   * @param selector the query selector.
   * @example
   * const obj = Optional({
   *   'a.b': {
   *     c: [1, 2, 3],
   *   },
   * });
   * console.log(obj.query('(a.b).c[1]').get()); // expect: 2
   * console.log(obj.query('"a.b".c[1]').get()); // expect: 2
   * console.log(obj.query('"a.b".c.1').get()); // expect: 2
   * console.log(obj.query('(a.b).c.1').get()); // expect: 2
   */
  query<T>(selector: string) {
    const select = (v: V) => {
      let res: any = v;
      const regex = /(?:\"([^\"]+)\"|\(([^\)]+)\)|([^\.\[\]]+))(?:\[(\d+)\])?/g;
      let match: RegExpExecArray | null = null;

      while ((match = regex.exec(selector)) !== null) {
        if (res === undefined) break;
        const key = match[1] || match[2] || match[3];
        const index = match[4];
        key && (res = res?.[key]);
        index !== undefined && (res = res?.[parseInt(index, 10)]);
      }

      return res as T;
    };
    return this.map(select);
  }
}

/**
 * Creates a {@link Nullable} version of given value.
 * @param value the value.
 */
export function Optional<V>(
  value: NullableType<V>,
  options?: NullableParseOptions<V>
) {
  return new Nullable(value, [options?.null ?? []].flat());
}

/**
 * Creates a {@link Nullable} type that considers given values as `null`.
 */
Optional.T = function <V>(options: NullableParseOptions<V>) {
  return (value: NullableType<V>) => Optional(value, options);
};

export class Symbolization {
  /**
   * Creates a method decorator that can adds new symbol to its class.
   * @param s the associated symbol.
   */
  public static createDecorator(s: symbol) {
    return function (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<any>
    ) {
      const handler = descriptor.value;
      if (handler instanceof Function) {
        target[s] = [...(target[s] ?? []), handler];
      }
    };
  }

  /**
   * Runs the handlers annotated with the {@link createDecorator}-created decorator.
   * @param cls the target class.
   * @param s the symbol.
   * @param thisInstance specific instance of the class.
   */
  public static process(
    cls: Class<any>,
    s: symbol,
    thisInstance: any,
    options?: {
      skip?: string[];
    }
  ) {
    ((cls.prototype[s] as Function[]) ?? []).forEach(async (handler) => {
      if (options?.skip?.includes(handler.name)) {
        return;
      }
      const value = handler.bind(thisInstance)();
      value instanceof Promise && (await value);
    });
  }
}

export type Role = string;
export type Action = 'view' | 'list' | 'create' | 'edit' | 'delete' | '*';

/**
 * Checks if an argument is a class declaration or not.
 * @param v the argument.
 */
export function isClass(v: any) {
  return (
    typeof v === 'function' &&
    v.prototype &&
    !Object.getOwnPropertyDescriptor(v, 'prototype').writable
  );
}

/**
 * Checks if an argument is a {@link String} or not.
 * @param v the argument.
 */
export function isString(v: any) {
  return typeof v === 'string' || v instanceof String;
}

/**
 * Adjusts name of a given object.
 * @param obj the object.
 * @param name the desired name.
 */
export function withName<T = any>(obj: T, name: string) {
  if (obj) {
    Object.defineProperty(obj, 'name', {
      value: name,
    });
  }
  return obj;
}

/**
 * Stores type of a given object internally.
 * @param obj the object.
 * @param cls type of the object.
 */
export function withClass<T = any>(obj: T, cls: Class<T>) {
  if (obj && !obj[ClassSymbol]) {
    Object.defineProperty(obj, ClassSymbol, {
      value: cls,
      writable: false,
    });
  }
  return obj;
}

/**
 * Retrieves type of a given singleton or a bean instance.
 * @param instance the instance.
 */
export function classOf<T>(instance: T): Class<T> {
  if (typeof instance === 'object') {
    return instance[ClassSymbol];
  }
  return Object as unknown as Class<T>;
}

/**
 * Simply returns an error with message `Not implemented yet`.
 */
export function notImplementedYet() {
  return new Error('Not implemented yet');
}

/**
 * A {@link Callable} instance can be called as a {@link Function}.
 */
export abstract class Callable<R = any> extends Function {
  private readonly $: Callable<R>;

  constructor() {
    super('...args', 'return this.$._(...args)');
    this.$ = this.bind(this) as Callable<R>;
    return this.$;
  }

  /**
   * This function will be executed when the instance is called.
   * @param args the arguments passed into the instance.
   */
  protected abstract _(...args: any[]): R;
}

/**
 * Current profiles (configured via environment variables `ENV` and `PROFILES`).
 */
export function profiles() {
  return new Set(
    [process.env.ENV, process.env.PROFILES]
      .map((val) => Optional(val))
      .map((opt) => opt.map((s) => s.toLowerCase()).map((s) => s.split(',')))
      .filter((opt) => opt.present)
      .map((opt) => opt.get())
      .flat()
  );
}

/**
 * Removes all `undefined` fields (and nested fields) of a given object.
 * @param obj the object.
 * @param removeEmpty to remove any field if it's an empty object.
 */
export function defined<T>(obj: T, removeEmpty?: boolean): T {
  if (Array.isArray(obj)) {
    return obj
      .map((item) => defined(item, removeEmpty))
      .filter((item) => item !== undefined) as unknown as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = defined(value, removeEmpty);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    if (!Object.keys(result).length && removeEmpty) return;
    return result;
  }

  return obj;
}

/**
 * Converts a specific value into a {@link Number}.
 * @param value the value.
 * @returns `undefined` if converted value is `NaN`.
 */
export function num(value: any): number | undefined {
  const val = Number(value);
  if (!Number.isNaN(val)) return val;
}
