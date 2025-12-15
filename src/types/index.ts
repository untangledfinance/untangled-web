export * from './config';

declare global {
  /**
   * A generic abstract class type.
   */
  type AbstractClass<T> = abstract new (...args: any[]) => T;
  /**
   * A generic class type.
   */
  type Class<T> = { new (...args: any[]): T };
  /**
   * A generic function type.
   */
  type Method<T> = (...args: any[]) => T;
  /**
   * Marks a class as a singleton type.
   * @param cls the class.
   */
  var Singleton: <C extends Class<any>>(cls: C) => C;
  /**
   * Marks a class as an IoC bean.
   * @param cls the class.
   * @param name a specific name of the bean.
   * @returns a {@link Singleton} version of the given class.
   */
  var Bean: <T>(cls: Class<T>, name?: string) => Class<T>;
  /**
   * Automatically initializes a {@link Bean}.
   */
  var Auto: <T>(cls: Class<T>) => Class<T>;
  /**
   * Retrieves an IoC bean for a specific class.
   * @param cls the class or its name.
   * @throws an error if no instance found.
   */
  var $: <T>(cls: Class<T> | string) => T;
  /**
   * Prints a message out with some additional information.
   * @param message the message.
   */
  var log: (message: string, ...args: any[]) => void;
  /**
   * Emits a message to specific channels.
   * @param message the message.
   * @param channels the channels' identifiers to send the message to.
   */
  var emit: <T>(message: T, ...channels: string[]) => Promise<void>;
  /**
   * Prepares handling messages received from specific channels.
   * @param handler the function to handle received messages.
   * @param channels the channels' identifiers to listen to.
   * @returns a function to remove registered function from handling received messages.
   */
  var on: <T>(
    handler: (message: T, channel: string) => void | Promise<void>,
    ...channels: string[]
  ) => Promise<() => void>;
}

export {};
