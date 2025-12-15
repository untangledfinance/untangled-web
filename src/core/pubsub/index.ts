import { Callable, notImplementedYet } from '../types';

/**
 * A publisher can push messages to specific channels.
 */
export class Publisher extends Callable<Promise<void>> {
  override async _<T>(message: T, ...channels: string[]) {
    return this.publish(message, ...channels);
  }

  /**
   * Pushes a message to specific channels.
   * @param message the message.
   * @param channels the channels.
   */
  async publish<T>(message: T, ...channels: string[]): Promise<void> {
    throw notImplementedYet();
  }
}

/**
 * A function to process a message from a specific subscribed channel.
 */
export type MessageHandler<T> = (
  message: T,
  channel: string
) => void | Promise<void>;

/**
 * A subscriber can receive messages from its subscribed channels.
 */
export class Subscriber extends Callable<Promise<() => Promise<void>>> {
  override async _<T>(handler: MessageHandler<T>, ...channels: string[]) {
    return this.subscribe(handler, ...channels);
  }

  /**
   * All subscribed channels.
   */
  get subscriptions(): string[] {
    throw notImplementedYet();
  }

  /**
   * Subscribes to given channels and uses a function to process received messages.
   * @param handler the function to process retrieved messages.
   * @param channels the channels.
   * @returns a function to remove the handler from subscribing to the channels.
   */
  async subscribe<T>(
    handler: MessageHandler<T>,
    ...channels: string[]
  ): Promise<() => Promise<void>> {
    throw notImplementedYet();
  }

  /**
   * Unsubscribes specific channels.
   * @param channels the channels.
   */
  async unsubscribe(...channels: string[]): Promise<void> {
    throw notImplementedYet();
  }
}
