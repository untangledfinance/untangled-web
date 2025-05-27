import {
  Cachable,
  CacheKey,
  CacheKeyGenerator,
  CacheStore,
  CacheValue,
} from '../../core/caching';
import { Req } from '../../core/http';
import { beanOf } from '../../core/ioc';
import { createLogger } from '../../core/logging';
import { getConfigs } from '../helpers';

const logger = createLogger('cache');

/**
 * {@link Cachable} with configured {@link CacheStore} bean.
 * @param ttl time-to-live in milliseconds.
 * @param version version of the cached value.
 * @param key the cached key or a function to generate the cached key.
 * @param events caching event handlers.
 */
export function Cache<S extends any[] = any[]>(
  ttl?: number,
  version?: number | string,
  key?: string | CacheKeyGenerator<S>,
  events?: Partial<{
    onHit: (cacheKey: CacheKey<S>, cacheValue: CacheValue<any>) => void;
    onMiss: (cacheKey: CacheKey<S>, cacheValue: CacheValue<any>) => void;
  }>
) {
  const configs = getConfigs();
  return Cachable({
    key,
    store: () => beanOf<CacheStore>(CacheStore.name),
    options: {
      expiry: ttl && Date.now() + ttl,
      version: version ?? configs.app.version,
    },
    events,
  });
}

/**
 * {@link Cache} for request handlers (i.e. controller methods).
 */
export function ReqCache(ttl?: number, version?: number | string) {
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
  return Cache(ttl, version, key, { onHit });
}
