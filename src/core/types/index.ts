const ClassSymbol = Symbol.for('__class__');

/**
 * @deprecated use `lodash` instead.
 * An object.
 */
export class Obj {
  /**
   * Makes a clone of a given object.
   * @param obj the object.
   * @throws an error if the object is... not an 'object'.
   */
  constructor(obj = {}) {
    if (typeof obj !== 'object') {
      throw new Error(`Obj must be 'object'`);
    }
    Object.entries(obj).forEach(([key, value]) => {
      this[key] = value; // FIXME: Must avoid prototype pollution
    });
  }
}

export type ClassDecorator = <T = any>(cls: Class<T>) => Class<T>;

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
    thisInstance?: any,
    options?: {
      skip?: string[];
      onComplete?: () => void;
    }
  ) {
    const handlers = ((cls.prototype[s] as Function[]) ?? []).filter(
      (handler) => !options?.skip?.includes(handler.name)
    );
    const processed = handlers.reduce(
      (m, h) => ({
        ...m,
        [h.name]: false,
      }),
      {}
    );
    handlers.forEach(async (handler) => {
      const value = handler.bind(thisInstance || {})();
      value instanceof Promise && (await value);
      processed[handler.name] = true;
    });
    const timer =
      options?.onComplete &&
      setInterval(() => {
        const completed = Object.values(processed).every((p) => p);
        if (completed) {
          options.onComplete();
          clearInterval(timer);
        }
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
 * Annotates an object with a given symbol.
 * @param obj the object.
 * @param s the symbol.
 * @param value value to assign (default: `true`).
 * @returns the object.
 */
export function withSymbol(obj: any, s: symbol, value: any = true) {
  if (obj && !(s in obj)) {
    Object.defineProperty(obj, s, {
      writable: false,
      value,
    });
  }
  return obj;
}

/**
 * Checks if an object is annotated with a given symbol or not.
 * @param obj the object.
 * @param s the symbol.
 */
export function hasSymbol(obj: any, s: symbol) {
  return obj && s in obj && obj[s] === true;
}

/**
 * Retrieves a specific property from an object's symbol.
 * @param obj the object.
 * @param s the symbol.
 */
export function getSymbol<T = any>(obj: any, s: symbol): T | undefined {
  if (obj && s in obj) {
    return obj[s] as T;
  }
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
  return withSymbol(obj, ClassSymbol, cls);
}

/**
 * Retrieves type of a given singleton or a bean instance.
 * @param obj the instance or the bean class.
 */
export function classOf<T>(obj: T | Class<T>): Class<T> {
  return getSymbol(obj, ClassSymbol);
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
 * Flattens a given object.
 * @param obj the object.
 * @param depth the depth of nested fields's flattening (default: 10).
 */
export function flatten<T>(
  obj: T,
  depth = 10,
  formatter = (value: any) => value
): T | string {
  if (depth === 0) return JSON.stringify(formatter(obj));
  if (Array.isArray(obj)) {
    return flatten(
      obj.reduce(
        (r, v, k) => ({
          ...r,
          [k]: v,
        }),
        {}
      ),
      depth - 1
    );
  }

  if (typeof obj === 'object' && obj !== null) {
    if (obj instanceof Date) {
      return formatter(obj);
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const pk = key.includes('.') ? `(${key})` : key;

      if (value instanceof Date) {
        result[pk] = formatter(value);
        continue;
      }

      const flattened = flatten(value, depth - 1);

      if (Array.isArray(flattened)) {
        flattened.forEach((v, k) => {
          result[`${pk}.${k}`] = v;
        });
        continue;
      }

      if (typeof flattened === 'object' && flattened !== null) {
        for (const [k, v] of Object.entries(flattened)) {
          result[`${pk}.${k}`] = v;
        }
        continue;
      }

      result[pk] = flattened;
    }
    return result;
  }

  return obj;
}

/**
 * Check if a text can be parsed as a decimal or not.
 * @param value the text.
 */
export function isDecimal(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value);
}

/**
 * Converts a specific value into a decimal.
 * @param value the value.
 * @returns `undefined` if couldn't convert it.
 */
export function num(value: any): number | undefined {
  if (typeof value === 'number') {
    return isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    if (!isDecimal(value)) return;
  }

  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

/**
 * Silently ignores all errors when invoking a function.
 * @param func the function.
 * @returns a silent function which returns `undefined` on errors.
 */
export function silent<T extends Function>(func: T): T {
  return ((...args: any[]) => {
    try {
      return func.bind(this)(...args);
    } catch {
      return;
    }
  }) as unknown as T;
}

/**
 * Wraps a given object to support safely accessing its properties
 * without concerning about the `undefined` errors.
 * @param obj the object.
 * @example
 * const obj = {
 *   a: {
 *     b: undefined,
 *     c: 69,
 *   },
 * };
 * console.log(obj.a.b.c); // Uncaught TypeError: Cannot read properties of undefined (reading 'c')
 * console.log(obj.d); // Uncaught TypeError: Cannot read properties of undefined (reading 'd')
 * const safeObj = safe(obj);
 * console.log(safeObj.a.b.c); // undefined
 * console.log(safeObj.a.c); // 69
 * console.log(safeObj.d); // undefined
 */
export const safe = (() => {
  /**
   * Wraps a primitive value in a proxy that returns the value itself, but
   * allows safe property access that returns createSafeProxy() for any property.
   */
  function wrapPrimitive(value: any): any {
    const target = {
      [Symbol.toPrimitive]() {
        return value;
      },
      valueOf() {
        return value;
      },
      toString() {
        return String(value);
      },
      toJSON() {
        return value;
      },
      [Symbol.for('nodejs.util.inspect.custom')]() {
        return value;
      },
    };

    return new Proxy(target, {
      get(target, prop) {
        // If the property exists on the target (special methods), return it
        if (prop in target) {
          return (target as any)[prop];
        }
        // For any other property access, return a safe proxy
        return createSafeProxy();
      },
    });
  }

  /**
   * Creates a proxy that evaluates to undefined but allows property chaining.
   * Any property access on this proxy will return another safe proxy.
   * It's also callable and will return another safe proxy when called.
   */
  function createSafeProxy(): any {
    // Use a function as the target so the proxy can be callable
    const target = function () {
      return createSafeProxy();
    };

    // Add special methods to the function
    target[Symbol.toPrimitive] = () => undefined;
    target.valueOf = () => undefined;
    target.toString = () => 'undefined';
    target.toJSON = () => undefined;
    target[Symbol.for('nodejs.util.inspect.custom')] = () => undefined;

    const handler: ProxyHandler<any> = {
      get(target, prop) {
        // If the property exists on the target (special methods), return it
        if (prop in target) {
          return target[prop];
        }
        // For any other property access, return another safe proxy
        return createSafeProxy();
      },
      // Make the proxy callable - return another safe proxy
      apply() {
        return createSafeProxy();
      },
      // Make it appear as undefined in some contexts
      ownKeys() {
        return [];
      },
      getOwnPropertyDescriptor() {
        return undefined;
      },
    };

    return new Proxy(target, handler);
  }

  return function safe<T extends object>(obj: T): T {
    if (obj === null || obj === undefined) {
      return createSafeProxy() as T;
    }

    return new Proxy(obj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // If the value is null or undefined, return a chainable safe proxy
        if (value === null || value === undefined) {
          return createSafeProxy();
        }

        // If the value is a function, return it as-is (functions should remain callable)
        if (typeof value === 'function') {
          return value;
        }

        // If the value is an object, wrap it with safe proxy recursively
        if (typeof value === 'object' && value !== null) {
          return safe(value);
        }

        // For primitive values (boolean, number, string), wrap them so property access is safe
        return wrapPrimitive(value);
      },
    }) as T;
  };
})();
