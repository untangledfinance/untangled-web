/**
 * Should be an asynchronous function that accepts a given argument
 * to start booting before a specific class instance initializes.
 */
export type BootLoader<T = any> = (options?: T) => () => Promise<void>;
