import { createLogger } from '../logging';
import type { Req } from './core';
import { HttpError } from './error';

const logger = createLogger('proxy');

export type ProxyURL = string | URL;
export type ProxyURLResolver =
  | ProxyURL
  | Promise<ProxyURL>
  | (() => ProxyURL)
  | (() => Promise<ProxyURL>);

export abstract class ProxyStore {
  /**
   * Retrieves a proxy URL for a specific key.
   * @param key the key.
   */
  abstract get(key: string): ProxyURLResolver;
}

export type ProxyOptions = ProxyURLResolver | ProxyStore;

/**
 * Symbol to identify a proxy directive object.
 */
export const PROXY_DIRECTIVE = Symbol('proxy');

/**
 * A directive object that instructs the HTTP layer to proxy the request
 * to a target URL using streaming.
 */
export interface ProxyDirective {
  readonly [PROXY_DIRECTIVE]: true;
  /**
   * The target URL to proxy to.
   */
  url: ProxyURL;
  /**
   * Optional headers to add/override when proxying.
   */
  headers?: Record<string, string | string[]>;
  /**
   * Optional HTTP method override.
   */
  method?: string;
  /**
   * Whether to forward the original request body.
   * Defaults to true.
   */
  forwardBody?: boolean;
  /**
   * Whether to forward the original query string.
   * Defaults to true.
   */
  forwardQuery?: boolean;
  /**
   * Headers to exclude from forwarding.
   * 'host' is always excluded.
   */
  excludeHeaders?: string[];
}

/**
 * Options for the proxyTo helper function.
 */
export interface ProxyToOptions {
  /**
   * Optional headers to add/override when proxying.
   */
  headers?: Record<string, string | string[]>;
  /**
   * Optional HTTP method override.
   */
  method?: string;
  /**
   * Whether to forward the original request body.
   * Defaults to true.
   */
  forwardBody?: boolean;
  /**
   * Whether to forward the original query string.
   * Defaults to true.
   */
  forwardQuery?: boolean;
  /**
   * Headers to exclude from forwarding.
   * 'host' is always excluded.
   */
  excludeHeaders?: string[];
}

/**
 * Creates a proxy directive that instructs the HTTP layer to stream
 * the request to the target URL.
 *
 * @example
 * ```typescript
 * @Get('/api/data')
 * async getData(req: Req) {
 *   // Conditionally proxy based on some logic
 *   if (shouldProxy(req)) {
 *     return proxyTo('https://backend-service.internal/data');
 *   }
 *   return { data: localData };
 * }
 * ```
 *
 * @param url The target URL to proxy to.
 * @param options Optional proxy configuration.
 * @returns A ProxyDirective object.
 */
export function proxyTo(
  url: ProxyURL,
  options?: ProxyToOptions
): ProxyDirective {
  return {
    [PROXY_DIRECTIVE]: true,
    url,
    headers: options?.headers,
    method: options?.method,
    forwardBody: options?.forwardBody ?? true,
    forwardQuery: options?.forwardQuery ?? true,
    excludeHeaders: options?.excludeHeaders,
  };
}

/**
 * Type guard to check if a value is a ProxyDirective.
 * @param value The value to check.
 * @returns True if the value is a ProxyDirective.
 */
export function isProxyDirective(value: unknown): value is ProxyDirective {
  return (
    typeof value === 'object' &&
    value !== null &&
    PROXY_DIRECTIVE in value &&
    (value as ProxyDirective)[PROXY_DIRECTIVE] === true
  );
}

/**
 * Executes a streaming proxy request using the original Request object.
 * This avoids buffering the entire response in memory.
 */
export async function streamProxy(
  originalReq: Request,
  directive: ProxyDirective,
  parsedReq: Req
): Promise<Response> {
  const targetUrl = directive.url.toString();
  const excludeHeaders = new Set(
    (directive.excludeHeaders ?? []).map((h) => h.toLowerCase())
  );
  excludeHeaders.add('host');

  // Build proxy headers from original request
  const proxyHeaders: Record<string, string> = {
    'X-Forwarded-Path': parsedReq.path ?? '',
    'X-Forwarded-Host': parsedReq.headers?.host?.toString() ?? '',
  };

  if (parsedReq.headers) {
    for (const [key, value] of Object.entries(parsedReq.headers)) {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.has(lowerKey)) {
        proxyHeaders[lowerKey] = Array.isArray(value)
          ? value.join(', ')
          : value;
      }
    }
  }

  // Override with directive headers
  if (directive.headers) {
    for (const [key, value] of Object.entries(directive.headers)) {
      proxyHeaders[key.toLowerCase()] = Array.isArray(value)
        ? value.join(', ')
        : value;
    }
  }

  // Build complete URL with query string
  let completeUrl = targetUrl;
  if (
    directive.forwardQuery !== false &&
    parsedReq.queryString &&
    Object.keys(parsedReq.query ?? {}).length > 0
  ) {
    const queryString = parsedReq.queryString.replace(/^\?*/, '');
    if (queryString) {
      const separator = completeUrl.includes('?') ? '&' : '?';
      completeUrl = `${completeUrl}${separator}${queryString}`;
    }
  }

  const method = directive.method ?? parsedReq.method ?? 'GET';
  const shouldForwardBody =
    directive.forwardBody !== false &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

  logger.debug(`Streaming proxy`, {
    from: `${parsedReq.path}${parsedReq.queryString || ''}`,
    to: completeUrl,
    method,
  });

  try {
    // Use the original request body stream directly for true streaming
    const proxyRes = await fetch(completeUrl, {
      method,
      headers: proxyHeaders,
      body: shouldForwardBody ? originalReq.body : undefined,
      // @ts-ignore - Bun supports duplex streaming
      duplex: shouldForwardBody ? 'half' : undefined,
    });

    logger.debug(`Streamed proxy response`, {
      to: completeUrl,
      status: proxyRes.status,
    });

    // Return the response directly - body is already a ReadableStream
    return proxyRes;
  } catch (err: any) {
    logger.error(`Streaming proxy error: ${err.message}`, err);
    throw new HttpError(502, 'Bad Gateway', err.message);
  }
}

/**
 * Executes a streaming proxy for decorator-based proxy configuration.
 * Uses the original Request for streaming instead of buffered body.
 */
export async function streamProxyFromUrl(
  originalReq: Request,
  proxyUrl: ProxyURL,
  parsedReq: Req
): Promise<Response> {
  const targetUrl = proxyUrl.toString();

  // Build proxy headers
  const proxyHeaders: Record<string, string> = {
    'X-Forwarded-Path': parsedReq.path ?? '',
    'X-Forwarded-Host': parsedReq.headers?.host?.toString() ?? '',
  };

  if (parsedReq.headers) {
    for (const [key, value] of Object.entries(parsedReq.headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'host') {
        proxyHeaders[lowerKey] = Array.isArray(value)
          ? value.join(', ')
          : value;
      }
    }
  }

  // Build complete URL with query string
  let completeUrl = targetUrl;
  if (parsedReq.queryString && Object.keys(parsedReq.query ?? {}).length > 0) {
    const queryString = parsedReq.queryString.replace(/^\?*/, '');
    if (queryString) {
      const separator = completeUrl.includes('?') ? '&' : '?';
      completeUrl = `${completeUrl}${separator}${queryString}`;
    }
  }

  const method = parsedReq.method ?? 'GET';
  const shouldForwardBody = !['GET', 'HEAD', 'OPTIONS'].includes(
    method.toUpperCase()
  );

  logger.debug(`Streaming proxy (decorator)`, {
    from: `${parsedReq.path}${parsedReq.queryString || ''}`,
    to: completeUrl,
    method,
  });

  try {
    const proxyRes = await fetch(completeUrl, {
      method,
      headers: proxyHeaders,
      body: shouldForwardBody ? originalReq.body : undefined,
      // @ts-ignore - Bun supports duplex streaming
      duplex: shouldForwardBody ? 'half' : undefined,
    });

    logger.debug(`Streamed proxy response (decorator)`, {
      to: completeUrl,
      status: proxyRes.status,
    });

    return proxyRes;
  } catch (err: any) {
    logger.error(`Streaming proxy error: ${err.message}`, err);
    throw new HttpError(502, 'Bad Gateway', err.message);
  }
}
