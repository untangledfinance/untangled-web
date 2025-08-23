import * as redis from 'redis';
import { Queue, QueueOptions, ReliableQueue } from '../../core/queue';
import { OnInit, OnStop } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';

/**
 * Redis client configurations.
 */
export type RedisOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: number;
};

export type RedisQueueOptions = QueueOptions & {
  timeout?: number;
};

/**
 * A message queue implementation using Redis.
 */
@Log
export class RedisQueue
  extends Queue<RedisQueueOptions>
  implements OnInit, OnStop
{
  private readonly logger: Logger;
  protected readonly client: redis.RedisClientType;

  constructor({
    host = 'localhost',
    port = 6379,
    username,
    password,
    database = 0,
  }: RedisOptions = {}) {
    super();
    this.client = redis.createClient({
      url: `redis://${host}:${port}`,
      username,
      password,
      database,
    });
  }

  /**
   * Adds a prefix to a queue.
   * @param queue the queue.
   */
  protected queueId(queue: string) {
    return `q:${queue}`;
  }

  async connect() {
    try {
      await this.client.connect();
      this.client.on('error', (err) => {
        this.logger.error(`${err.message}\n`, err);
      });
      this.logger.info('Connected');
    } catch (err) {
      this.logger.error(`Connection failed: ${err.message}`);
      throw err;
    }
  }

  async disconnect() {
    await this.client.disconnect();
    this.logger.info('Disconnected');
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.disconnect();
  }

  override async enqueue<T>(
    queue: string,
    message: T,
    options?: RedisQueueOptions
  ) {
    await this.client.lPush(
      this.queueId(queue),
      JSON.stringify({
        message,
      })
    );
  }

  override async dequeue<T>(queue: string, options?: RedisQueueOptions) {
    try {
      const timeout =
        typeof options?.timeout === 'number' ? options.timeout : undefined;
      const queueId = this.queueId(queue);
      const { message } = JSON.parse(
        timeout !== undefined
          ? (await this.client.brPop(queueId, timeout)).element
          : await this.client.rPop(queueId)
      ) as { message: T };
      return message;
    } catch {
      return null;
    }
  }

  override async peek<T>(queue: string, options?: RedisQueueOptions) {
    try {
      const { message } = JSON.parse(
        (await this.client.lRange(this.queueId(queue), -1, -1))?.at(0)
      ) as { message: T };
      return message;
    } catch {
      return null;
    }
  }

  override async remove<T>(
    queue: string,
    message: T,
    options?: RedisQueueOptions
  ) {
    await this.client.lRem(this.queueId(queue), 1, JSON.stringify({ message }));
  }
}

/**
 * A reliable message queue using Redis.
 */
export class ReliableRedisQueue
  extends RedisQueue
  implements ReliableQueue<RedisQueueOptions>
{
  protected readonly pendingQueuePrefix: string;

  /**
   * Retrieves the pending queue associating with a given queue.
   * @param queue the queue.
   */
  public pendingQueue(queue: string) {
    return this.pendingQueuePrefix + queue;
  }

  constructor(
    options: RedisOptions & {
      /**
       * The prefix to add to the queue to create its associated pending queue.
       */
      pendingQueuePrefix?: string;
    }
  ) {
    super(options);
    this.pendingQueuePrefix = options.pendingQueuePrefix || 'tmp_';
  }

  override async dequeue<T>(queue: string, options?: RedisQueueOptions) {
    try {
      const timeout =
        typeof options?.timeout === 'number' ? options.timeout : undefined;
      const pendingQueue = this.pendingQueue(queue);
      const queueId = this.queueId(queue);
      const pendingQueueId = this.queueId(pendingQueue);
      const { message } = JSON.parse(
        timeout !== undefined
          ? await this.client.brPopLPush(queueId, pendingQueueId, timeout)
          : await this.client.rPopLPush(queueId, pendingQueueId)
      ) as { message: T };
      return message;
    } catch {
      return null;
    }
  }

  async complete<T>(queue: string, message: T, options?: RedisQueueOptions) {
    const pendingQueue = this.pendingQueue(queue);
    return this.remove(pendingQueue, message, options);
  }
}
