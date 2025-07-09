import {
  CacheKeyGenerator,
  CacheOptions,
  CacheStore,
} from '../../core/caching';
import { Filter, Next, Req, Res } from '../../core/http';

export type ReqCacheOptions = {
  /**
   * Time-to-live in milliseconds.
   */
  ttl?: number;
  /**
   * Version of the cached value.
   */
  version?: number | string;
};

export const reqCacheKey: CacheKeyGenerator<[Req]> = (req) => {
  const { method, path, queryString, query } = req ?? {};
  const search =
    queryString ||
    new URLSearchParams(query as Record<string, string>).toString();
  return [method, path, search].join(':');
};

/**
 * Returns a {@link Filter} for caching.
 */
export function cache(options: Partial<ReqCacheOptions>): Filter {
  return async function <T>(req: Req<T>, res: Res, next?: Next<T>) {
    const cacheStore = $<CacheStore<CacheOptions>>(CacheStore.name);
    const cacheKey = reqCacheKey(req);
    const cacheValue = await cacheStore.get(cacheKey, options?.version);
    if (cacheValue.hit) {
      return {
        req,
        res: {
          ...res,
          completed: true,
          data: cacheValue.value,
        },
      };
    }
    if (next) {
      const r = await next(req, res);
      if (
        r.req.method.toUpperCase() === 'GET' &&
        r.res &&
        !(r.res instanceof Response)
      ) {
        const newValue = r.res.data;
        await cacheStore.set(cacheKey, newValue, {
          expiry: options.ttl && Date.now() + options.ttl,
          version: options.version,
        });
      }
      return r;
    }
    return { req, res };
  };
}
