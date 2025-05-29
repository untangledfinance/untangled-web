import { AsyncLocalStorage } from 'async_hooks';

/**
 * Where we stores all {@link Context}s.
 */
const contexts: Record<string, Context> = {};

/**
 * A storage to retrieve/store values across calls.
 */
export class Context<T = any> {
  private readonly storage = new AsyncLocalStorage<T>();

  constructor(
    /**
     * Name of the {@link Context}.
     */
    readonly name: string,
    /**
     * Returns when the storage is empty (default: `undefined`).
     */
    private readonly defaultValue?: T
  ) {}

  /**
   * Retrieves the current value in the storage.
   * @returns the default value if the storage is empty.
   */
  get<V extends T = T>(): V | undefined {
    const value = this.storage.getStore();
    return (value === undefined ? this.defaultValue : value) as V;
  }

  /**
   * Retrieves the current value in the storage.
   * @throws an error if the storage is empty.
   */
  getOrThrow<V extends T = T>(): V {
    const value = this.get<V>();
    if (value !== undefined) return value;
    throw new Error(`Context "${this.name}" has no value`);
  }

  /**
   * Stores a value into the storage.
   * @param value the value.
   */
  set<V extends T = T>(value: V) {
    this.storage.enterWith(value);
  }

  /**
   * Runs a function within the {@link Context} with a given initial value.
   * @param value the initial value of the {@link Context}.
   * @param func the function to run.
   */
  run<V extends T = T, R = any>(value: V, func: () => R): R {
    return this.storage.run(value, func);
  }

  /**
   * Retrieves a {@link Context} by its name.
   * @param name name of the {@link Context}.
   * @param defaultValue the default value of the {@link Context}.
   */
  static for<V = any>(name: string, defaultValue?: V): Context<V> {
    let context = contexts[name];
    if (!context) {
      context = new Context<V>(name, defaultValue);
      contexts[name] = context;
    }
    return context;
  }
}
