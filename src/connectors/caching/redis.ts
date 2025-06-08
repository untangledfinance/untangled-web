import * as redis from 'redis';
import {
  CacheOptions,
  CacheStore,
  CacheValue,
  MomentAfter,
} from '../../core/caching';
import { OnInit, OnStop } from '../../core/ioc';
import { Log } from '../../core/logging';

/**
 * Redis {@link CacheStore}'s configurations.
 */
export type RedisOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: number;
};

/**
 * Redis {@link CacheStore}.
 */
export class RedisStore
  extends Log(CacheStore<CacheOptions>, 'Redis')
  implements OnInit, OnStop
{
  private readonly client: redis.RedisClientType;

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

  async onInit() {
    await this.client.connect();
    this.logger.info('Connected');
  }

  async onStop() {
    await this.client.disconnect();
    this.logger.info('Disconnected');
  }

  override async get<T>(
    key: string,
    version?: number | string
  ): Promise<CacheValue<T>> {
    try {
      const json = await this.client.get(key);
      if (json) {
        const { value, version: ver } = JSON.parse(json) as {
          value: T;
          version?: number | string;
        };
        if (version && version !== ver) {
          await this.client.del(key);
        } else {
          return new CacheValue(value, true, version);
        }
      }
    } catch (err) {
      this.logger.error(`${err.message}\n`, err);
    }
    return new CacheValue();
  }

  override async set<T>(
    key: string,
    value: T,
    { version, expiry = MomentAfter.min(5) }: CacheOptions
  ): Promise<void> {
    try {
      const ex = Math.floor((expiry - Date.now()) / 1e3); // in seconds
      if (ex <= 0) return;
      await this.client.set(
        key,
        JSON.stringify({
          value,
          version,
        }),
        {
          EX: ex,
        }
      );
    } catch (err) {
      this.logger.error(`${err.message}\n`, err);
    }
  }

  override async delete<T>(key: string): Promise<CacheValue<T>> {
    try {
      const json = await this.client.get(key);
      if (json) {
        await this.client.del(key);
        const { value, version } = JSON.parse(json) as {
          value: T;
          version?: number | string;
        };
        return new CacheValue(value, true, version);
      }
    } catch (err) {
      this.logger.error(`${err.message}\n`, err);
    }
    return new CacheValue();
  }

  override async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  override async count(pattern: string): Promise<number> {
    let count = 0;
    let cursor = 0;
    while (true) {
      const { cursor: next, keys } = await this.client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = next;
      count += keys.length;
      if (cursor === 0) break;
    }
    return count;
  }
}
