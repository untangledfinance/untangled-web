import { Callable, notImplementedYet } from '../types';

/**
 * Options for queues.
 */
export type QueueOptions = {};

/**
 * Supports queues for messaging (FIFO).
 */
export class Queue<O extends QueueOptions = QueueOptions> extends Callable<
  Promise<void>
> {
  override async _<T>(queue: string, message: T, options?: O) {
    return this.enqueue(queue, message, options);
  }

  /**
   * Adds a message at the end of a given queue.
   * @param queue the queue.
   * @param message the message.
   * @throws should thrown an error when adding fails.
   */
  async enqueue<T>(queue: string, message: T, options?: O): Promise<void> {
    throw notImplementedYet();
  }

  /**
   * Obtains the head message of a given queue and removes it.
   * @param queue the queue.
   */
  async dequeue<T>(queue: string, options?: O): Promise<T | null> {
    throw notImplementedYet();
  }

  /**
   * Obtains the head message of a given queue. The message is
   * retained in the queue after this action.
   * @param queue the queue.
   */
  async peek<T>(queue: string, options?: O): Promise<T | null> {
    throw notImplementedYet();
  }

  /**
   * Removes a message from a given queue.
   * @param queue the queue.
   * @param message the message.
   */
  async remove<T>(queue: string, message: T, options?: O): Promise<void> {
    throw notImplementedYet();
  }
}

/**
 * In a reliable queue, when a message is dequeued, it is not immediately
 * removed but moved to a pending (temporary) queue until it is confirmed
 * to be completely processed.
 */
export interface ReliableQueue<O extends QueueOptions = QueueOptions> {
  /**
   * Removes a message from the pending queue of a given queue after completely
   * processing it.
   * @param queue the queue.
   * @param message the message.
   */
  complete<T>(queue: string, message: T, options?: O): Promise<void>;
}
