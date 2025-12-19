import type { OnStop } from '../../ioc';
import { createLogger } from '../../logging';
import { isClass, profiles } from '../../types';
import { Step } from '../../validation';
import { StatusCode, configure } from '../core';
import type {
  CorsOptions,
  Filter,
  FilterOptions,
  Handler,
  HttpMethod,
  Req,
  Res,
  RouteOptions,
  Router,
  ServeOptions,
  Server,
  StreamReq,
} from '../core';
import { HttpError, NotFoundError } from '../error';
import { isProxyDirective, streamProxy } from '../proxy';

const logger = createLogger('bun');

/**
 * Represents a registered route entry in the routing table.
 */
interface RouteEntry {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, or * for any) */
  method: HttpMethod;
  /** URL path pattern (supports :param for path parameters) */
  path: string;
  /** Handler function that processes the request and returns a Response */
  handler: (
    req: Request | Req,
    params?: Record<string, string>
  ) => Promise<Response>;
}

/**
 * Utility class for HTTP request/response processing in Bun runtime.
 * Provides static methods for request parsing, response conversion,
 * CORS handling, and URL path matching.
 */
export class Helper {
  /**
   * Creates a {@link Req} object with lazy body parsing.
   *
   * Body is NOT parsed until explicitly requested via `getBody()`, `getRawBody()`,
   * or `getFiles()`. This allows streaming routes to forward the raw request body
   * without consuming it.
   *
   * After parsing, the cached values are accessible via `req.body`, `req.rawBody`,
   * and `req.files` getters.
   *
   * Supports the following content types:
   * - `multipart/form-data` - Parsed into body object + files array
   * - `application/json` - Parsed into JavaScript object
   * - `application/x-www-form-urlencoded` - Parsed into key-value object
   * - `text/*` - Kept as string
   * - Other - Kept as raw string
   *
   * @param req - The raw Bun Request object
   * @param params - URL path parameters (e.g., `{ id: '123' }` for `/:id`)
   * @param rawRequest - Optional cloned Request for streaming proxy support
   * @returns A {@link Req} object with lazy body parsing capabilities
   */
  static createLazyReq(
    req: Request,
    params: Record<string, string> = {},
    rawRequest?: Request
  ): Req {
    const url = new URL(req.url);
    const queryString = url.search || undefined;
    const query: Record<string, string | string[]> = {};

    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          query[key] = [existing, value];
        }
      } else {
        query[key] = value;
      }
    });

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const contentType = req.headers.get('content-type') || '';
    const method = req.method;

    // Lazy body parsing state
    let bodyParsed = false;
    let parsedBody: any = undefined;
    let parsedRawBody: string | undefined = undefined;
    let parsedBodyParser: string | undefined = undefined;
    let parsedFiles:
      | Array<{
          name: string;
          filename: string;
          type: string;
          size: number;
          data: Blob;
        }>
      | undefined = undefined;

    // Lazy body parser - only called when body is accessed
    const parseBody = async (): Promise<void> => {
      if (bodyParsed) return;
      bodyParsed = true;

      if (method === 'GET' || method === 'HEAD') {
        return;
      }

      try {
        if (contentType.includes('multipart/form-data')) {
          parsedBodyParser = 'multipart';
          const formData = await req.formData();
          const formBody: Record<string, any> = {};
          parsedFiles = [];

          for (const [key, value] of formData.entries()) {
            const v = value as any;
            if (
              typeof v === 'object' &&
              v !== null &&
              'name' in v &&
              'size' in v &&
              'type' in v
            ) {
              parsedFiles.push({
                name: key,
                filename: v.name,
                type: v.type,
                size: v.size,
                data: v,
              });
            } else {
              if (formBody[key] !== undefined) {
                if (Array.isArray(formBody[key])) {
                  formBody[key].push(value);
                } else {
                  formBody[key] = [formBody[key], value];
                }
              } else {
                formBody[key] = value;
              }
            }
          }
          parsedBody = formBody;
        } else {
          parsedRawBody = await req.text();
          if (contentType.includes('application/json')) {
            parsedBodyParser = 'json';
            try {
              parsedBody = JSON.parse(parsedRawBody);
            } catch {
              parsedBody = parsedRawBody;
            }
          } else if (
            contentType.includes('application/x-www-form-urlencoded')
          ) {
            parsedBodyParser = 'urlencoded';
            parsedBody = Object.fromEntries(new URLSearchParams(parsedRawBody));
          } else if (contentType.includes('text/')) {
            parsedBodyParser = 'text';
            parsedBody = parsedRawBody;
          } else {
            parsedBodyParser = 'raw';
            parsedBody = parsedRawBody;
          }
        }
      } catch {
        // Body already consumed or empty
      }
    };

    const result: Req = {
      method,
      path: url.pathname,
      headers,
      query,
      queryString,
      params,
      encoding: 'utf8',
      rawRequest,
      // Lazy body accessors - call these to trigger parsing
      getBody: async () => {
        await parseBody();
        return parsedBody;
      },
      getRawBody: async () => {
        await parseBody();
        return parsedRawBody;
      },
      getFiles: async () => {
        await parseBody();
        return parsedFiles;
      },
    };

    // Define getters for backward compatibility
    // After getBody() is called, these return the cached values
    Object.defineProperties(result, {
      body: {
        get: () => parsedBody,
        set: (v) => {
          parsedBody = v;
        },
        enumerable: true,
      },
      rawBody: {
        get: () => parsedRawBody,
        set: (v) => {
          parsedRawBody = v;
        },
        enumerable: true,
      },
      bodyParser: {
        get: () => parsedBodyParser,
        set: (v) => {
          parsedBodyParser = v;
        },
        enumerable: true,
      },
      files: {
        get: () => parsedFiles,
        set: (v) => {
          parsedFiles = v;
        },
        enumerable: true,
      },
    });

    return result;
  }

  /**
   * Creates a {@link StreamReq} object with Promise-based body access.
   *
   * Designed for streaming routes where body should not be auto-parsed.
   * Body properties (`body`, `rawBody`, `files`) return Promises that resolve
   * when accessed via `await req.body`.
   *
   * Use this for routes that need to:
   * - Stream request body to another service (proxy)
   * - Handle large file uploads without buffering
   * - Process body data incrementally
   *
   * @param req - The raw Bun Request object (will be consumed when body is accessed)
   * @param params - URL path parameters (e.g., `{ id: '123' }` for `/:id`)
   * @param rawRequest - Optional cloned Request for streaming proxy support
   * @returns A {@link StreamReq} object with Promise-based body access
   *
   * @example
   * ```typescript
   * // In a streaming route handler:
   * const body = await req.body; // Triggers parsing, returns parsed body
   * const files = await req.files; // Returns uploaded files
   * ```
   */
  static createStreamReq(
    req: Request,
    params: Record<string, string> = {},
    rawRequest?: Request
  ): StreamReq {
    const url = new URL(req.url);
    const queryString = url.search || undefined;
    const query: Record<string, string | string[]> = {};

    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          query[key] = [existing, value];
        }
      } else {
        query[key] = value;
      }
    });

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const contentType = req.headers.get('content-type') || '';
    const method = req.method;

    // Use the request directly for body parsing
    // (caller should pass a cloned request if rawRequest needs to be preserved)
    const bodyReq = req;

    // Shared parsing state - parse once, cache results for body and files
    let parsePromise:
      | Promise<{
          body: any;
          rawBody: string | undefined;
          files: any[] | undefined;
          bodyParser: string | undefined;
        }>
      | undefined;

    const ensureParsed = () => {
      if (parsePromise) return parsePromise;

      parsePromise = (async () => {
        let body: any = undefined;
        let rawBody: string | undefined = undefined;
        let files: any[] | undefined = undefined;
        let bodyParser: string | undefined = undefined;

        if (method === 'GET' || method === 'HEAD') {
          return { body, rawBody, files, bodyParser };
        }

        try {
          if (contentType.includes('multipart/form-data')) {
            bodyParser = 'multipart';
            const formData = await bodyReq.formData();
            const formBody: Record<string, any> = {};
            files = [];

            for (const [key, value] of formData.entries()) {
              const v = value as any;
              if (
                typeof v === 'object' &&
                v !== null &&
                'name' in v &&
                'size' in v &&
                'type' in v
              ) {
                files.push({
                  name: key,
                  filename: v.name,
                  type: v.type,
                  size: v.size,
                  data: v,
                });
              } else {
                if (formBody[key] !== undefined) {
                  if (Array.isArray(formBody[key])) {
                    formBody[key].push(value);
                  } else {
                    formBody[key] = [formBody[key], value];
                  }
                } else {
                  formBody[key] = value;
                }
              }
            }
            body = formBody;
            if (files.length === 0) files = undefined;
          } else {
            rawBody = await bodyReq.text();
            if (contentType.includes('application/json')) {
              bodyParser = 'json';
              try {
                body = JSON.parse(rawBody);
              } catch {
                body = rawBody;
              }
            } else if (
              contentType.includes('application/x-www-form-urlencoded')
            ) {
              bodyParser = 'urlencoded';
              body = Object.fromEntries(new URLSearchParams(rawBody));
            } else if (contentType.includes('text/')) {
              bodyParser = 'text';
              body = rawBody;
            } else {
              bodyParser = 'raw';
              body = rawBody;
            }
          }
        } catch {
          // Body already consumed or empty
        }

        return { body, rawBody, files, bodyParser };
      })();

      return parsePromise;
    };

    // Cached promise getters
    let bodyPromise: Promise<any> | undefined;
    let rawBodyPromise: Promise<string | undefined> | undefined;
    let filesPromise: Promise<any[] | undefined> | undefined;
    let parsedBodyParser: string | undefined = undefined;

    const getBodyPromise = (): Promise<any> => {
      if (bodyPromise) return bodyPromise;
      bodyPromise = ensureParsed().then((r) => {
        parsedBodyParser = r.bodyParser;
        return r.body;
      });
      return bodyPromise;
    };

    const getRawBodyPromise = (): Promise<string | undefined> => {
      if (rawBodyPromise) return rawBodyPromise;
      rawBodyPromise = ensureParsed().then((r) => r.rawBody);
      return rawBodyPromise;
    };

    const getFilesPromise = (): Promise<any[] | undefined> => {
      if (filesPromise) return filesPromise;
      filesPromise = ensureParsed().then((r) => r.files);
      return filesPromise;
    };

    const result: StreamReq = {
      method,
      path: url.pathname,
      headers,
      query,
      queryString,
      params,
      encoding: 'utf8',
      rawRequest,
    } as StreamReq;

    // Define Promise-based getters
    Object.defineProperties(result, {
      body: {
        get: () => getBodyPromise(),
        enumerable: true,
      },
      rawBody: {
        get: () => getRawBodyPromise(),
        enumerable: true,
      },
      bodyParser: {
        get: () => parsedBodyParser,
        enumerable: true,
      },
      files: {
        get: () => getFilesPromise(),
        enumerable: true,
      },
    });

    return result;
  }

  /**
   * Extracts response metadata from a {@link Response} object into a {@link Res} object.
   * Used for emitting response events with status and headers information.
   *
   * @param response - Optional Response object to extract metadata from
   * @returns A {@link Res} object with status code and headers
   */
  static toRes(response?: Response): Res {
    if (response) {
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        status: response.status,
        headers,
      };
    }
    return {
      status: StatusCode.OK,
      headers: {},
    };
  }

  /**
   * Creates a CORS preflight response with appropriate headers.
   *
   * @param options - CORS configuration options
   * @param options.allowedOrigins - Allowed origin(s) for Access-Control-Allow-Origin
   * @param options.allowedHeaders - Allowed headers for Access-Control-Allow-Headers
   * @param options.allowedMethods - Allowed methods for Access-Control-Allow-Methods
   * @param options.maxAge - Max age for Access-Control-Max-Age (default: 5 seconds)
   * @returns A 204 No Content Response with CORS headers
   */
  static corsResponse(options: Partial<CorsOptions> = {}): Response {
    const { allowedOrigins, allowedHeaders, allowedMethods, maxAge } = options;
    const headers = new Headers();

    if (allowedOrigins) {
      headers.set(
        'Access-Control-Allow-Origin',
        [allowedOrigins].flat().join(',')
      );
    }
    if (allowedHeaders) {
      headers.set(
        'Access-Control-Allow-Headers',
        [allowedHeaders].flat().join(',')
      );
    }
    if (allowedMethods) {
      headers.set(
        'Access-Control-Allow-Methods',
        [allowedMethods].flat().join(',')
      );
    }
    headers.set('Access-Control-Max-Age', (maxAge ?? '5').toString());

    return new Response(null, { status: StatusCode.NoContent, headers });
  }

  /**
   * Converts various response types into a standard Bun {@link Response}.
   *
   * Handles the following input types:
   * - {@link Response} - Returned as-is
   * - {@link Res} object - Converted using data, status, and headers
   * - `null`/`undefined` - Returns 204 No Content
   * - `string` - Returns as text/plain
   * - Object/Array - Serialized as JSON
   *
   * @param res - The response data to convert
   * @returns A Bun {@link Response} object
   */
  static toResponse(res: Res | Response | any): Response {
    if (res instanceof Response) {
      return res;
    }

    // Check if it's a Res object (has data/status/headers structure)
    const isResObject =
      res &&
      typeof res === 'object' &&
      ('data' in res || 'status' in res || 'completed' in res);

    if (isResObject) {
      const { data, status, headers } = res as Res;
      const responseHeaders = new Headers();

      for (const key of Object.keys(headers ?? {})) {
        responseHeaders.set(key, String(headers[key]));
      }

      let body: BodyInit | null = null;
      if (data !== undefined && data !== null) {
        if (
          typeof data === 'object' &&
          !(data instanceof Uint8Array) &&
          !(data instanceof ArrayBuffer)
        ) {
          body = JSON.stringify(data);
          if (!responseHeaders.has('Content-Type')) {
            responseHeaders.set('Content-Type', 'application/json');
          }
        } else {
          body = data as BodyInit;
        }
      }

      return new Response(body, {
        status: status ?? 200,
        headers: responseHeaders,
      });
    }

    // Handle raw data (object, array, string, etc.)
    if (res === undefined || res === null) {
      return new Response(null, { status: 204 });
    }

    if (typeof res === 'string') {
      return new Response(res, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Assume it's an object or array - serialize as JSON
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Matches a URL path against a route pattern and extracts path parameters.
   *
   * Supports:
   * - Exact matches: `/users` matches `/users`
   * - Path parameters: `/users/:id` matches `/users/123` with `{ id: '123' }`
   * - Wildcard suffix: `/api/*` matches `/api/anything/here`
   *
   * @param pattern - The route pattern to match against
   * @param path - The actual URL path to match
   * @returns Object with `matched` boolean and extracted `params`
   *
   * @example
   * ```typescript
   * Helper.matchPath('/users/:id', '/users/123');
   * // { matched: true, params: { id: '123' } }
   *
   * Helper.matchPath('/api/*', '/api/v1/users');
   * // { matched: true, params: {} }
   *
   * Helper.matchPath('/users', '/posts');
   * // { matched: false, params: {} }
   * ```
   */
  static matchPath(
    pattern: string,
    path: string
  ): { matched: boolean; params: Record<string, string> } {
    const params: Record<string, string> = {};

    // Handle wildcard patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (path.startsWith(prefix)) {
        return { matched: true, params };
      }
      return { matched: false, params };
    }

    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return { matched: false, params };
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        params[patternPart.slice(1)] = pathPart;
      } else if (patternPart !== pathPart) {
        return { matched: false, params };
      }
    }

    return { matched: true, params };
  }
}

/**
 * Abstract base class for route grouping and middleware management.
 *
 * Provides functionality for:
 * - Registering routes (GET, POST, PUT, PATCH, DELETE)
 * - Applying middleware filters
 * - CORS configuration
 * - Error handling
 * - Sub-group mounting
 * - Event emission
 *
 * Extended by {@link Application} for full server functionality.
 */
export abstract class Group implements Router {
  /** Registered routes for this group */
  protected routes: RouteEntry[] = [];
  /** CORS configuration options */
  protected corsOptions?: Partial<CorsOptions>;
  /** Error handler for this group */
  protected errorHandler?: (err: Error, req: Req) => Promise<Res>;
  /** Event handlers map (event name -> handler functions) */
  private eventHandlers: Map<string, Function[]> = new Map();
  /** Filters map (router class or '*' for global -> filter functions) */
  private filters: Map<Class<Router> | '*', Filter[]> = new Map();
  /** Mounted sub-groups with their path prefixes */
  protected subGroups: { prefix: string; group: Group }[] = [];
  /** Whether configure() has been called */
  private configured = false;

  /**
   * Configures the group by applying decorator-based route configuration.
   * Called automatically before first route registration.
   *
   * @param filters - Additional filters to apply during configuration
   */
  protected configure(...filters: Filter[]) {
    configure(this, ...(this.filters.get('*') ?? []), ...filters);
    this.configured = true;
  }

  /**
   * Registers a filter to run before specific router(s).
   *
   * @param options - Filter options
   * @param options.guard - The filter function to apply
   * @param options.before - Router class(es) to apply the filter before
   * @returns This group for method chaining
   */
  @Step(1)
  with({ guard: filter, before }: FilterOptions) {
    const routers = before instanceof Array ? before : [before];
    routers.forEach((rc) => {
      const fs = this.filters.get(rc) ?? [];
      fs.push(filter);
      this.filters.set(rc, fs);
    });
    return this;
  }

  /**
   * Registers a global filter that runs for all routes in this group.
   *
   * @param filter - The filter function to apply globally
   * @returns This group for method chaining
   */
  @Step(1)
  guard(filter: Filter) {
    this.filters.set('*', [...(this.filters.get('*') ?? []), filter]);
    return this;
  }

  /**
   * Applies route configuration from a module (via RoutingConfigurer).
   *
   * Creates route handlers that bridge between the Application's raw Request
   * routing and the module's controller handlers. This is called when a module
   * decorated with `@Module` is configured.
   *
   * @param options - Route configuration options
   * @param options.routes - Array of route definitions from the module
   * @param options.fetcher - Function that creates handlers for each route
   * @param options.error - Error handler for the module
   * @returns This group for method chaining
   */
  apply({ routes, fetcher, error }: Partial<RouteOptions>) {
    if (routes?.length && fetcher) {
      for (const route of routes) {
        const controllerHandler: Handler = fetcher.bind(this)(route);

        /**
         * Route handler that receives requests from Application.start().
         *
         * @param rawOrParsedReq - Raw Request from Bun server, or pre-parsed Req
         * @param routeParams - URL path parameters extracted by Application routing
         *                      (e.g., { collection: 'users', id: '123' } for /:collection/:id)
         */
        const routeHandler = async (
          rawOrParsedReq: Request | Req,
          routeParams?: Record<string, string>
        ): Promise<Response> => {
          let req: Req;

          if (rawOrParsedReq instanceof Request) {
            // Convert raw Request to Req with lazy body parsing
            const url = new URL(rawOrParsedReq.url);
            // Prefer params from Application routing; fall back to local matching for direct use
            const params =
              routeParams ?? Helper.matchPath(route.path, url.pathname).params;
            const rawRequest = rawOrParsedReq.clone();
            req = Helper.createLazyReq(rawOrParsedReq, params, rawRequest);
          } else {
            // Already a parsed Req (e.g., from nested group)
            req = rawOrParsedReq;
          }

          const result = await controllerHandler(req);
          return Helper.toResponse(result);
        };

        this.routes.push({
          method: route.method as HttpMethod,
          path: route.path,
          handler: routeHandler,
        });
      }
    }
    this.errorHandler = error;
    return this;
  }

  /**
   * Configures CORS (Cross-Origin Resource Sharing) for this group.
   *
   * @param options - CORS options or '*' to allow all origins/methods/headers
   * @returns This group for method chaining
   *
   * @example
   * ```typescript
   * app.cors('*'); // Allow all
   * app.cors({
   *   allowedOrigins: ['https://example.com'],
   *   allowedMethods: ['GET', 'POST'],
   *   allowedHeaders: ['Content-Type', 'Authorization']
   * });
   * ```
   */
  @Step(0)
  cors(options: Partial<CorsOptions> | '*') {
    if (options === '*') {
      this.corsOptions = {
        allowedOrigins: ['*'],
        allowedMethods: ['*'],
        allowedHeaders: ['*'],
      };
    } else {
      this.corsOptions = options;
    }
    return this;
  }

  /**
   * Internal method to register a route with the group.
   *
   * Creates a handler that:
   * - Converts raw Request to Req/StreamReq based on streaming option
   * - Extracts path parameters from URL
   * - Handles ProxyDirective returns for streaming proxy
   * - Delegates to error handler on exceptions
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH, or * for any)
   * @param path - URL path pattern (supports :param for path parameters)
   * @param handler - Handler function to process the request
   * @param options - Route options
   * @param options.streaming - If true, use StreamReq instead of Req for body access
   * @returns This group for method chaining
   */
  @Step(2)
  _route(
    method: HttpMethod,
    path: string,
    handler: Handler,
    options?: { streaming?: boolean }
  ) {
    !this.configured && this.configure();

    const handle: Handler = handler.bind(this);
    const routeHandler = async (
      reqOrParsed: Request | Req | StreamReq,
      passedParams?: Record<string, string>
    ): Promise<Response> => {
      let req: Req | StreamReq;
      let rawRequest: Request | undefined;
      if (reqOrParsed instanceof Request) {
        const url = new URL(reqOrParsed.url);
        // Use passed params if available (from Application routing), otherwise match locally
        const params =
          passedParams ?? Helper.matchPath(path, url.pathname).params;
        // Clone first for rawRequest (used for streaming proxy)
        rawRequest = reqOrParsed.clone();
        // Clone again for body parsing (so rawRequest stream is preserved)
        const bodyReq = reqOrParsed.clone();
        // Use StreamReq for streaming routes, Req for normal routes
        if (options?.streaming) {
          req = Helper.createStreamReq(bodyReq, params, rawRequest);
        } else {
          req = Helper.createLazyReq(bodyReq, params, rawRequest);
        }
      } else {
        req = reqOrParsed;
        if (!rawRequest && req.rawRequest) {
          rawRequest = req.rawRequest;
        }
      }
      try {
        const result = await handle(req as Req);

        // Handle ProxyDirective for streaming proxy
        if (isProxyDirective(result)) {
          if (rawRequest) {
            return streamProxy(rawRequest, result, req);
          }
          // Fallback if no rawRequest available
          const proxyRes = await fetch(result.url.toString(), {
            method: result.method ?? req.method,
            headers: {
              'X-Forwarded-Path': req.path ?? '',
              ...result.headers,
            } as Record<string, string>,
          });
          return proxyRes;
        }

        return Helper.toResponse(result);
      } catch (err) {
        if (!(err instanceof HttpError)) {
          logger.error(`${err.message}\n`, err);
        }
        if (this.errorHandler) {
          const errorResult = await this.errorHandler(err, req);
          return Helper.toResponse(errorResult);
        }
        throw err;
      }
    };

    this.routes.push({ method, path, handler: routeHandler });
    return this;
  }

  /**
   * Registers a route with any HTTP method.
   *
   * @param method - HTTP method
   * @param path - URL path pattern
   * @param handler - Handler function
   * @param options - Route options (e.g., { streaming: true })
   * @returns This group for method chaining
   */
  route<T = Res, R extends Req | StreamReq = Req>(
    method: HttpMethod,
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route(method, path, handler as Handler, options);
  }

  /**
   * Registers a route that matches any HTTP method.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @param options - Route options (e.g., { streaming: true })
   * @returns This group for method chaining
   */
  request<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('*', path, handler as Handler, options);
  }

  /**
   * Registers a GET route.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @returns This group for method chaining
   */
  get<T = Res>(path: string, handler: Handler<T>) {
    return this._route('GET', path, handler);
  }

  /**
   * Registers a POST route.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @param options - Route options (e.g., { streaming: true })
   * @returns This group for method chaining
   */
  post<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('POST', path, handler as Handler, options);
  }

  /**
   * Registers a PUT route.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @param options - Route options (e.g., { streaming: true })
   * @returns This group for method chaining
   */
  put<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('PUT', path, handler as Handler, options);
  }

  /**
   * Registers a PATCH route.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @param options - Route options (e.g., { streaming: true })
   * @returns This group for method chaining
   */
  patch<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('PATCH', path, handler as Handler, options);
  }

  /**
   * Registers a DELETE route.
   *
   * @param path - URL path pattern
   * @param handler - Handler function
   * @returns This group for method chaining
   */
  delete(path: string, handler: Handler) {
    return this._route('DELETE', path, handler);
  }

  /**
   * Internal method to mount a sub-group at a path prefix.
   *
   * @param prefix - URL path prefix for the sub-group
   * @param args - Filters, group class, and constructor arguments
   * @returns This group for method chaining
   */
  @Step(2)
  _use(prefix: string, ...args: [...Filter[], Class<Group>, ...any]) {
    !this.configured && this.configure();
    const filters: Filter[] = [];
    for (let i = 0; i < args.length; i++) {
      if (isClass(args[i])) {
        const group = args[i] as Class<Group>;
        const groupArgs = args.slice(i + 1);
        const g = new (class extends group {})(...groupArgs) as Group;
        if (!g.configured) {
          g.configure(
            ...(this.filters.get('*') ?? []),
            ...filters,
            ...(this.filters.get(group) ?? [])
          );
        }
        this.subGroups.push({ prefix, group: g });
        break;
      }
      filters.push(args[i] as Filter);
    }
    return this;
  }

  /**
   * Mounts a sub-group (module) at a path prefix.
   *
   * @param prefix - URL path prefix (e.g., '/api')
   * @param group - Group class to mount
   * @param args - Constructor arguments for the group
   * @returns This group for method chaining
   *
   * @example
   * ```typescript
   * app.use('/users', UserModule);
   * app.use('/auth', AuthModule, { secret: 'key' });
   * ```
   */
  use(prefix: string, group: Class<Group>, ...args: any[]) {
    return this._use(prefix, group, ...args);
  }

  /**
   * Mounts a sub-group asynchronously.
   * Useful for dynamic imports or lazy-loaded modules.
   *
   * @param prefix - URL path prefix
   * @param group - Promise resolving to group class, or function returning one
   * @param args - Constructor arguments for the group
   * @returns This group for method chaining
   *
   * @example
   * ```typescript
   * app.useAsync('/admin', () => import('./admin.module').then(m => m.AdminModule));
   * ```
   */
  useAsync(
    prefix: string,
    group: Promise<Class<Group>> | (() => Class<Group> | Promise<Class<Group>>),
    ...args: any[]
  ) {
    return this.on('start', async () => {
      const g = await (async () => {
        const g = await (group instanceof Promise ? group : group?.());
        if (!isClass(g)) {
          throw new Error('Invalid async routing!');
        }
        return g;
      })();
      return this._use(prefix, g, ...args);
    });
  }

  /**
   * Registers an event handler.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function to execute when event fires
   * @returns This group for method chaining
   */
  on(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return this;
  }

  /**
   * Emits an event, calling all registered handlers.
   * Handlers are called asynchronously and errors are logged but not thrown.
   *
   * @param event - Event name to emit
   * @param data - Data to pass to handlers
   * @returns This group for method chaining
   */
  emit(event: string, ...data: any[]) {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.forEach(async (handler) => {
      try {
        const res = handler.bind(this)(...data);
        res instanceof Promise && (await res);
      } catch (err) {
        logger.error(`${err.message}\n`, err);
      }
    });
    return this;
  }

  /**
   * Collects all routes from this group and its sub-groups.
   * Routes are prefixed with the provided path prefix.
   *
   * @param prefix - Path prefix to prepend to all routes (default: '')
   * @returns Array of all RouteEntry objects with normalized paths
   */
  getAllRoutes(prefix: string = ''): RouteEntry[] {
    const allRoutes: RouteEntry[] = [];

    // Add own routes with prefix
    for (const route of this.routes) {
      allRoutes.push({
        ...route,
        path: this.normalizePath(prefix + route.path),
      });
    }

    // Add sub-group routes
    for (const { prefix: subPrefix, group } of this.subGroups) {
      const subRoutes = group.getAllRoutes(prefix + subPrefix);
      allRoutes.push(...subRoutes);
    }

    return allRoutes;
  }

  /**
   * Normalizes a URL path by removing duplicate slashes and ensuring leading slash.
   *
   * @param path - Path to normalize
   * @returns Normalized path starting with /
   */
  private normalizePath(path: string): string {
    return '/' + path.split('/').filter(Boolean).join('/');
  }

  /**
   * Returns the CORS options configured for this group.
   *
   * @returns CORS options or undefined if not configured
   */
  getCorsOptions(): Partial<CorsOptions> | undefined {
    return this.corsOptions;
  }

  /**
   * Returns the error handler configured for this group.
   *
   * @returns Error handler function or undefined if not configured
   */
  getErrorHandler(): ((err: Error, req: Req) => Promise<Res>) | undefined {
    return this.errorHandler;
  }
}

/**
 * Events emitted by the HTTP {@link Server}.
 *
 * - `crashed` - Server encountered a fatal error
 * - `start` - Server is about to start
 * - `started` - Server has started and is listening
 * - `stop` - Server is about to stop
 * - `stopped` - Server has stopped
 * - `request` - A request was received (before handling)
 * - `response` - A response was sent (after handling)
 */
type ServerEvent =
  | 'crashed'
  | 'start'
  | 'started'
  | 'stop'
  | 'stopped'
  | 'request'
  | 'response';

/**
 * Abstract base class for Bun HTTP server applications.
 *
 * Extends {@link Group} with server lifecycle management (start/stop).
 * Handles incoming requests by matching against registered routes,
 * processing CORS preflight, and emitting request/response events.
 *
 * @example
 * ```typescript
 * @Module({
 *   controllers: [UserController]
 * })
 * class App extends Application {
 *   async main() {
 *     this.cors('*')
 *       .on('started', (data) => console.log('Server started', data))
 *       .on('response', (req, res) => console.log(req.method, req.path, res.status))
 *       .use('/api', ApiModule)
 *       .start({ port: 3000 });
 *   }
 * }
 * ```
 */
export abstract class Application extends Group implements Server, OnStop {
  /** Bun server instance */
  private server?: ReturnType<typeof Bun.serve>;

  /**
   * Starts the HTTP server.
   *
   * Collects all routes from this application and its sub-groups,
   * configures the Bun server, and begins listening for requests.
   *
   * Request handling flow:
   * 1. CORS preflight (OPTIONS) - Returns CORS headers if configured
   * 2. Route matching - Finds first matching route by method and path
   * 3. Request processing - Converts Request to Req, calls handler
   * 4. Response emission - Emits 'response' event with Req and Res metadata
   * 5. Error handling - Delegates to error handler or returns 500
   * 6. 404 handling - Returns Not Found if no route matches
   *
   * @param options - Server options
   * @param options.host - Hostname to bind to (default: '0.0.0.0')
   * @param options.port - Port to listen on (default: 3000)
   * @returns This application for method chaining
   * @throws Error if server is already running
   */
  async start({ host, port, idleTimeout }: Partial<ServeOptions> = {}) {
    !this.routes.length && configure(this);
    if (this.server) {
      throw new Error('Already served!');
    }
    this.emit('start');

    const allRoutes = this.getAllRoutes();
    const corsOptions = this.getCorsOptions();
    const errorHandler = this.getErrorHandler();

    const self = this;

    this.server = Bun.serve({
      hostname: host ?? '0.0.0.0',
      port: port ?? 3000,
      idleTimeout: idleTimeout ?? 60,

      async fetch(req: Request, server): Promise<Response> {
        const url = new URL(req.url);
        const method = req.method.toUpperCase();
        const path = url.pathname;

        // Handle CORS preflight first (before any body consumption)
        if (method === 'OPTIONS' && corsOptions) {
          const response = Helper.corsResponse(corsOptions);
          // Create a minimal Req for the response event
          const corsReq = Helper.createLazyReq(req.clone(), {});
          self.emit('response', corsReq, Helper.toRes(response));
          return response;
        }

        // Find matching route
        for (const route of allRoutes) {
          const routeMethod =
            route.method === '*' ? method : route.method.toUpperCase();
          if (routeMethod !== method && route.method !== '*') continue;

          const { matched, params } = Helper.matchPath(route.path, path);
          if (matched) {
            // Clone for event emission (preserves body for handler)
            const eventReqClone = req.clone();
            try {
              // Pass raw Request to handler (handler creates Req/StreamReq as needed)
              const response = await route.handler(req, params);
              // Create Req for response event after handler completes
              const eventReq = Helper.createLazyReq(eventReqClone, params);
              self.emit('response', eventReq, Helper.toRes(response));
              return response;
            } catch (err) {
              if (!(err instanceof HttpError)) {
                logger.error(`${err.message}\n`, err);
              }
              if (errorHandler) {
                const errorReq = Helper.createLazyReq(eventReqClone, params);
                const errorResult = await errorHandler(err, errorReq);
                const errorResponse = Helper.toResponse(errorResult);
                self.emit('response', errorReq, Helper.toRes(errorResponse));
                return errorResponse;
              }
              const serverErrorReq = Helper.createLazyReq(
                eventReqClone,
                params
              );
              const serverErrorResponse = new Response(
                'Internal Server Error',
                { status: 500 }
              );
              self.emit(
                'response',
                serverErrorReq,
                Helper.toRes(serverErrorResponse)
              );
              return serverErrorResponse;
            }
          }
        }

        // No route found
        if (errorHandler) {
          const rawRequest = req.clone();
          const parsedReq = Helper.createLazyReq(req, {}, rawRequest);
          const errorResult = await errorHandler(
            new NotFoundError(),
            parsedReq
          );
          const errorResponse = Helper.toResponse(errorResult);
          self.emit('response', parsedReq, Helper.toRes(errorResponse));
          return errorResponse;
        }

        // Create a minimal Req for 404 response event
        const notFoundReq = Helper.createLazyReq(req.clone(), {});
        const notFoundResponse = new Response('Not Found', { status: 404 });
        self.emit('response', notFoundReq, Helper.toRes(notFoundResponse));
        return notFoundResponse;
      },

      error(error: Error): Response {
        self.emit('crashed', error);
        logger.error(`Server error: ${error.message}\n`, error);
        return new Response('Internal Server Error', { status: 500 });
      },
    });

    this.emit('started', {
      app: {
        type: 'bun',
        env: process.env.ENV,
        profiles: [...profiles()],
        host: host ?? '0.0.0.0',
        port: this.server.port,
      },
    });

    return this;
  }

  /**
   * Stops the HTTP server.
   * Emits 'stop' before stopping and 'stopped' after.
   */
  async stop() {
    this.emit('stop');
    if (this.server) {
      this.server.stop(true);
      this.server = undefined;
    }
    this.emit('stopped');
  }

  /**
   * Called when the application is being destroyed (IoC lifecycle).
   * Delegates to {@link stop}.
   */
  async onStop() {
    await this.stop();
  }

  /**
   * Registers an event handler for server events.
   *
   * @param event - Server event to listen for
   * @param handler - Handler function
   * @returns This application for method chaining
   */
  override on(event: ServerEvent, handler: Function) {
    return super.on(event, handler);
  }

  /**
   * Emits a server event.
   *
   * @param event - Server event to emit
   * @param data - Data to pass to handlers
   * @returns This application for method chaining
   */
  override emit(event: ServerEvent, ...data: any[]) {
    return super.emit(event, ...data);
  }
}
