export type BootLoader<T = any> = (options?: T) => () => Promise<void>;
