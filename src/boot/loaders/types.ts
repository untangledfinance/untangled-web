/**
 * Should be an asynchronous function that accepts a given argument
 * to start booting before a specific class instance initializes.
 */
export type BootLoader = (...args: any[]) => Promise<void>;

/**
 * Returns a {@link BootLoader} with specific options.
 */
export type UseBootLoader<T = any> = (options?: T) => BootLoader;
