import { beanOf } from '../../core/ioc';
import {
  Lock,
  LockKey,
  LockKeyGenerator,
  LockOptions,
  Lockable,
} from '../../core/locking';
import { createLogger } from '../../core/logging';
import { Configurations } from '../../types';

const logger = createLogger('lock');

/**
 * Creates a lock decorator factory that uses a configured {@link Lock} bean.
 *
 * @param configs Function that returns the application configurations.
 * @returns A decorator factory for locking methods.
 *
 * @example
 * ```typescript
 * // In your app configuration
 * export const Locked = createLockDecorator(() => Configs);
 *
 * // In your service
 * class OrderService {
 *   @Locked(5000, 30000) // timeout: 5s, ttl: 30s
 *   async processOrder(orderId: string) {
 *     // Only one execution at a time per unique arguments
 *   }
 * }
 * ```
 */
export const createLockDecorator = (configs: () => Configurations) => {
  /**
   * {@link Lockable} decorator with configured {@link Lock} bean.
   *
   * @param timeout Timeout to wait for lock acquisition (in milliseconds).
   * @param ttl Time-to-live of the lock (in milliseconds).
   * @param key Custom lock key or a function to generate the lock key.
   * @param events Lock lifecycle event handlers.
   */
  return function <S extends any[] = any[]>(
    timeout?: number,
    ttl?: number,
    key?: string | LockKeyGenerator<S>,
    events?: Partial<{
      onAcquired: (lockKey: LockKey<S>) => void;
      onReleased: (lockKey: LockKey<S>) => void;
      onTimeout: (lockKey: LockKey<S>, timeout: number) => void;
    }>
  ) {
    const defaultEvents: typeof events = {
      onAcquired: (lockKey) => {
        logger.debug(`Lock acquired: ${lockKey.value}`);
      },
      onReleased: (lockKey) => {
        logger.debug(`Lock released: ${lockKey.value}`);
      },
      onTimeout: (lockKey, t) => {
        logger.warn(`Lock timeout after ${t}ms: ${lockKey.value}`);
      },
    };

    return Lockable<LockOptions>({
      key,
      lock: () => beanOf<Lock>(Lock.name),
      options: () => ({
        timeout,
        ttl,
      }),
      events: {
        ...defaultEvents,
        ...events,
      },
    });
  };
};

/**
 * Creates a lock decorator with a custom lock key generator based on request.
 * Useful for request-scoped locking in controllers.
 *
 * @param configs Function that returns the application configurations.
 * @returns A decorator factory for locking request handlers.
 *
 * @example
 * ```typescript
 * export const ReqLock = createRequestLockDecorator(() => Configs);
 *
 * class OrderController {
 *   @ReqLock(5000, 30000)
 *   async createOrder(req: Req) {
 *     // Locked per unique request path + query
 *   }
 * }
 * ```
 */
export const createRequestLockDecorator = (configs: () => Configurations) => {
  /**
   * {@link Lockable} decorator for request handlers.
   *
   * @param timeout Timeout to wait for lock acquisition (in milliseconds).
   * @param ttl Time-to-live of the lock (in milliseconds).
   */
  return function (timeout?: number, ttl?: number) {
    const key: LockKeyGenerator<[string, string, { path?: string }]> = (
      controller,
      handler,
      req
    ) => {
      const { path } = req ?? {};
      return [controller, handler, path].filter(Boolean).join(':');
    };

    return createLockDecorator(configs)(timeout, ttl, key, {
      onAcquired: (lockKey) => {
        const [controller, handler] = lockKey.args ?? [];
        logger.debug(`Request lock acquired:`, { controller, handler });
      },
      onTimeout: (lockKey, t) => {
        const [controller, handler] = lockKey.args ?? [];
        logger.warn(`Request lock timeout after ${t}ms:`, {
          controller,
          handler,
        });
      },
    });
  };
};
