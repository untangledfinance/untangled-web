import { Req } from '../../core/http';
import { Optional, profiles } from '../../core/types';

/**
 * Retrieves the client IP from a request.
 * @param req the request.
 */
export function clientIP<T>(req: Req<T>) {
  const keys = ['cf-connecting-ip', 'x-forwarded-for', 'true-client-ip'];
  const ip = Optional(keys.find((key) => !!req.headers?.[key])).map(
    (key) => req.headers?.[key] as string
  );
  return ip.present ? ip.get() : 'none';
}

/**
 * Retrieves the User Agent of a request.
 * @param req the request.
 */
export function userAgent<T>(req: Req<T>) {
  return req.headers?.['user-agent'] ?? 'none';
}

/**
 * Checks if the current profile is `dev` or not.
 */
export function isDev() {
  return profiles().has('dev');
}
