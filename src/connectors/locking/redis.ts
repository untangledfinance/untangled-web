import * as redis from 'redis';
import { OnInit, OnStop } from '../../core/ioc';
import { Lock, LockOptions, UnlockOptions } from '../../core/locking';
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

const DEFAULT_LOCK_TTL = 30000; // 30 seconds
const RETRY_INTERVAL = 100; // 100ms between retries

/**
 * A locking implementation using Redis.
 * Uses SET NX PX for atomic lock acquisition.
 *
 * Features:
 * - Author-based unlock: If a lock is created with an author, only the same
 *   author can release it. If no author is provided, anyone can unlock.
 * - Wait with timeout: Caller can wait for a lock to be released by specifying
 *   a timeout in the lock options.
 */
@Log
export class RedisLock extends Lock implements OnInit, OnStop {
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

  /**
   * Adds a prefix to a key.
   * @param key the key.
   */
  protected lockId(key: string) {
    return `lock:${key}`;
  }

  /**
   * Tries to acquire the lock once (no waiting).
   * @param lockKey the full lock key (with prefix).
   * @param ttl time-to-live in milliseconds.
   * @param auth optional author identifier.
   * @returns `true` if acquired; otherwise, `false`.
   */
  private async tryAcquire(lockKey: string, ttl: number, auth?: string) {
    // Store author in lock value, or empty string if no author
    const lockValue = auth ?? '';
    const result = await this.client.set(lockKey, lockValue, {
      NX: true,
      PX: ttl,
    });
    return result === 'OK';
  }

  /**
   * Acquires a lock on the specified key using Redis SET NX PX.
   *
   * If `timeout` is provided in options, will retry until lock is acquired
   * or timeout expires.
   *
   * @param key the key to lock.
   * @param options lock options including ttl, timeout, and auth.
   * @returns `true` if the lock was acquired; otherwise, `false`.
   */
  override async lock(key: string, options?: LockOptions) {
    const lockKey = this.lockId(key);
    const ttl = options?.ttl ?? DEFAULT_LOCK_TTL;
    const timeout = options?.timeout;
    const auth = options?.auth;

    try {
      // First attempt
      if (await this.tryAcquire(lockKey, ttl, auth)) {
        this.logger.debug(`Lock acquired: ${key}`);
        return true;
      }

      // If no timeout specified, return immediately
      if (!timeout || timeout <= 0) {
        this.logger.debug(`Lock not acquired (already held): ${key}`);
        return false;
      }

      // Wait and retry until timeout
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        await Bun.sleep(RETRY_INTERVAL);

        if (await this.tryAcquire(lockKey, ttl, auth)) {
          this.logger.debug(`Lock acquired after waiting: ${key}`);
          return true;
        }
      }

      this.logger.debug(`Lock timeout exceeded: ${key}`);
      return false;
    } catch (err) {
      this.logger.error(`Failed to acquire lock: ${err.message}\n`, err);
      return false;
    }
  }

  /**
   * Releases the lock on the specified key.
   *
   * If the lock was created with an author, only the same author can release it.
   * If the lock was created without an author, anyone can release it.
   *
   * @param key the key to unlock.
   * @param options unlock options including auth.
   * @returns `true` if the lock was released; otherwise, `false`.
   */
  override async unlock(key: string, options?: UnlockOptions) {
    const lockKey = this.lockId(key);
    const auth = options?.auth;

    try {
      // Get current lock value to check author
      const lockValue = await this.client.get(lockKey);

      // Lock doesn't exist
      if (lockValue === null) {
        this.logger.debug(`Lock not found: ${key}`);
        return false;
      }

      // Check author authorization
      // If lock has an author (non-empty value), verify it matches
      if (lockValue !== '' && lockValue !== auth) {
        this.logger.debug(`Unlock denied (auth mismatch): ${key}`);
        return false;
      }

      // Release the lock
      const result = await this.client.del(lockKey);
      const released = result > 0;

      if (released) {
        this.logger.debug(`Lock released: ${key}`);
      } else {
        this.logger.debug(`Lock already released: ${key}`);
      }
      return released;
    } catch (err) {
      this.logger.error(`Failed to release lock: ${err.message}\n`, err);
      return false;
    }
  }

  /**
   * Checks if the specified key is currently locked.
   * @param key the key to check.
   * @returns `true` if the key is locked; otherwise, `false`.
   */
  override async locked(key: string) {
    const lockKey = this.lockId(key);

    try {
      const result = await this.client.exists(lockKey);
      return result === 1;
    } catch (err) {
      this.logger.error(`Failed to check lock status: ${err.message}\n`, err);
      return false;
    }
  }
}
