import {
  Cachable,
  CacheKey,
  CacheKeyGenerator,
  CacheStore,
  CacheValue,
  RenewableCacheOptions,
} from '../../core/caching';
import { Req } from '../../core/http';
import { beanOf } from '../../core/ioc';
import { createLogger } from '../../core/logging';
import { Configurations } from '../../types';

const logger = createLogger('cache');

export const createCacheDecorator = (configs: () => Configurations) => {
  const decorator = (renewable?: boolean) => {
    /**
     * {@link Cachable} with configured {@link CacheStore} bean.
     * @param ttl time-to-live in milliseconds.
     * @param version version of the cached value.
     * @param key the cached key or a function to generate the cached key.
     * @param events caching event handlers.
     */
    return function <S extends any[] = any[]>(
      ttl?: number,
      version?: number | string,
      key?: string | CacheKeyGenerator<S>,
      events?: Partial<{
        onHit: (cacheKey: CacheKey<S>, cacheValue: CacheValue<any>) => void;
        onMiss: (cacheKey: CacheKey<S>, cacheValue: CacheValue<any>) => void;
      }>
    ) {
      return Cachable({
        key,
        store: () => beanOf<CacheStore<RenewableCacheOptions>>(CacheStore.name),
        options: () => ({
          expiry: ttl && Date.now() + ttl,
          version: version ?? configs()?.app?.version,
          renewable,
        }),
        events,
      });
    };
  };
  const cacheDecorator = decorator();
  (cacheDecorator as any).Auto = decorator(true);
  return cacheDecorator as typeof cacheDecorator & {
    Auto: typeof cacheDecorator;
  };
};

export const createRequestCacheDecorator = (configs: () => Configurations) => {
  const decorator = (renewable?: boolean) => {
    /**
     * {@link Cache} for request handlers (i.e. controller methods).
     */
    return function (ttl?: number, version?: number | string) {
      const key: CacheKeyGenerator<[string, string, Req]> = (
        controller,
        handler,
        req
      ) => {
        const { method, path, query } = req ?? {};
        const search = new URLSearchParams(
          query as Record<string, string>
        ).toString();
        return [controller, handler, method, path, search].join(':');
      };
      const onHit = (cacheKey: CacheKey<[string, string, Req]>) => {
        const [controller, handler, req] = cacheKey.args ?? [];
        const { method, path, query } = req ?? {};
        const search = new URLSearchParams(
          query as Record<string, string>
        ).toString();
        logger.debug(`Cache hit:`, {
          controller,
          handler,
          method,
          path,
          search,
        });
      };
      const cacheDecorator = renewable
        ? createCacheDecorator(configs).Auto
        : createCacheDecorator(configs);
      return cacheDecorator(ttl, version, key, { onHit });
    };
  };
  const cacheDecorator = decorator();
  (cacheDecorator as any).Auto = decorator(true);
  return cacheDecorator as typeof cacheDecorator & {
    Auto: typeof cacheDecorator;
  };
};
