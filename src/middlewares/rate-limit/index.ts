import { CacheOptions, CacheStore } from '../../core/caching';
import { Filter, Req, Res, TooManyRequestsError } from '../../core/http';
import { Optional, profiles } from '../../core/types';

type RateLimitOptions = {
  /**
   * Request-per-minute limit.
   */
  rpm: number;
  /**
   * Finds the key group of a given request.
   * @param req the request.
   * @description Similar requests should have a same key group
   * and the rate-limit mechanism may apply to them, i.e., each request
   * of a key group should increase the tracking number of this key group.
   */
  group: <T>(req: Req<T>) => string;
};

/**
 * Retrieves the client IP from a request.
 * @param req the request.
 */
export function clientIP<T>(req: Req<T>, ...headerKeys: string[]) {
  const keys = [
    'cf-connecting-ip',
    'x-forwarded-for',
    'true-client-ip',
    ...headerKeys,
  ];
  const ip = Optional(keys.find((key) => !!req.headers?.[key])).map(
    (key) => req.headers?.[key] as string
  );
  return ip.present ? ip.get() : '';
}

/**
 * Generates key group for a request based on the client IP.
 * @param req the request.
 */
export function ClientIPKeyGroup<T>(req: Req<T>) {
  const { method = 'GET', path = '/' } = req;
  return [clientIP(req), method, path]
    .join(':')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
}

/**
 * Returns a {@link Filter} for rate limiting.
 */
export function rateLimit(options: Partial<RateLimitOptions>): Filter {
  const limit = options.rpm ?? 12;
  const keyGroup = options.group ?? ClientIPKeyGroup;
  return async function <T>(req: Req<T>, res: Res) {
    const cacheStore = $<CacheStore<CacheOptions>>(CacheStore.name);
    const group = keyGroup(req);
    const rpm = await cacheStore.count(`${group}:*`);
    if (rpm >= limit) {
      const errorCode = profiles().has('dev') && group;
      throw new TooManyRequestsError(
        `Rate limit exceeded: ${limit}`,
        errorCode
      );
    }
    const now = Date.now();
    await cacheStore.set(`${group}:${now}`, true, {
      expiry: now + 60 * 1e3, // 1 minute
    });
    return { req, res };
  };
}

/**
 * Applies a rate-limit to a request handler (using {@link CacheStore} internally).
 */
export function RateLimit(options: Partial<RateLimitOptions> = {}) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const filter = rateLimit(options);
    const handler = descriptor.value;
    descriptor.value = async function <T>(req: Req<T>, res: Res) {
      const checked = await filter(req, res);
      return handler.bind(this)(checked.req, checked.res);
    };
  };
}
