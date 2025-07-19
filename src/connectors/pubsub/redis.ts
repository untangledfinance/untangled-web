import * as redis from 'redis';
import { MessageHandler, Publisher, Subscriber } from '../../core/pubsub';
import { Log, Logger } from '../../core/logging';
import { OnInit, OnStop } from '../../core/ioc';

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

@Log
export class RedisPublisher extends Publisher implements OnInit, OnStop {
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

  async connect() {
    try {
      await this.client.connect();
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

  override async publish<T>(message: T, ...channels: string[]) {
    const m = JSON.stringify({ message, timestamp: Date.now() });
    await Promise.all(
      channels.map((channel) => this.client.publish(channel, m))
    );
  }
}

@Log
export class RedisSubscriber extends Subscriber implements OnInit, OnStop {
  private readonly logger: Logger;
  protected readonly client: redis.RedisClientType;
  protected readonly subs = new Map<string, MessageHandler<any>[]>();

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

  async connect() {
    try {
      await this.client.connect();
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

  override get subscriptions() {
    return Object.keys(this.subs);
  }

  override async subscribe<T>(
    handler: MessageHandler<T>,
    ...channels: string[]
  ) {
    const rChannels = [] as string[];
    const pChannels = [] as string[];
    for (const channel of channels) {
      if (channel.includes('*')) {
        pChannels.push(channel);
      } else {
        rChannels.push(channel);
      }
    }
    const h: MessageHandler<string> = (m, channel) => {
      try {
        const { message } = JSON.parse(m) as { message: T };
        return handler(message, channel);
      } catch (err) {
        this.logger.error(`Failed when processing message: ${err.message}`);
        throw err;
      }
    };
    await Promise.all(
      [
        rChannels.length && this.client.subscribe(rChannels, h),
        pChannels.length && this.client.pSubscribe(pChannels, h),
      ].filter((f) => !!f)
    );
    for (const channel of channels) {
      const handlers = this.subs.get(channel) || [];
      this.subs.set(channel, [...handlers, handler]);
    }
  }

  override async unsubscribe(...channels: string[]) {
    const rChannels = [] as string[];
    const pChannels = [] as string[];
    for (const channel of channels) {
      if (channel.includes('*')) {
        pChannels.push(channel);
      } else {
        rChannels.push(channel);
      }
    }
    await Promise.all(
      [
        rChannels.length && this.client.unsubscribe(rChannels),
        pChannels.length && this.client.pUnsubscribe(pChannels),
      ].filter((f) => !!f)
    );
    for (const channel of channels) {
      this.subs.delete(channel);
    }
  }
}
