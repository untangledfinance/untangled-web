import { hasSymbol, isClass, profiles, withSymbol } from '../../types';
import { Step } from '../../validation';
import { createLogger } from '../../logging';
import type { OnStop } from '../../ioc';
import { HttpContext } from '../context';
import { HttpError, NotFoundError } from '../error';
import { configure, StatusCode } from '../core';
import {
  isProxyDirective,
  streamProxy,
  type ProxyDirective,
  type ProxyURL,
} from '../proxy';
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
  StreamHandler,
} from '../core';

const logger = createLogger('bun');

const RoutedSymbol = Symbol.for('__routed__');

interface RouteEntry {
  method: HttpMethod;
  path: string;
  handler: (
    req: Request | Req,
    server: any,
    params?: Record<string, string>
  ) => Promise<Response>;
}

export class Helper {
  /**
   * Creates a Req object with lazy body parsing.
   * Body is parsed only when getBody(), getRawBody(), or getFiles() is called.
   * After parsing, req.body/rawBody/files contain the cached values.
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
   * Creates a StreamReq object with Promise-based body access.
   * Use for streaming routes where body should not be auto-parsed.
   * Access body with `await req.body`.
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

  static toRes(): Res {
    return {
      status: StatusCode.OK,
      headers: {},
    };
  }

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

export abstract class Group implements Router {
  protected routes: RouteEntry[] = [];
  protected corsOptions?: Partial<CorsOptions>;
  protected errorHandler?: (err: Error, req: Req) => Promise<Res>;
  private eventHandlers: Map<string, Function[]> = new Map();
  private filters: Map<Class<Router> | '*', Filter[]> = new Map();
  protected subGroups: { prefix: string; group: Group }[] = [];
  private configured = false;

  protected configure(...filters: Filter[]) {
    configure(this, ...(this.filters.get('*') ?? []), ...filters);
    this.configured = true;
  }

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

  @Step(1)
  guard(filter: Filter) {
    this.filters.set('*', [...(this.filters.get('*') ?? []), filter]);
    return this;
  }

  protected async send(
    responseTracker: { sent: boolean },
    response: Res | Response
  ): Promise<Response | null> {
    if (!responseTracker.sent && !hasSymbol(responseTracker, RoutedSymbol)) {
      withSymbol(responseTracker, RoutedSymbol);
      responseTracker.sent = true;
      return Helper.toResponse(response);
    }
    return null;
  }

  apply({ routes, fetcher, error }: Partial<RouteOptions>) {
    if (routes?.length && fetcher) {
      for (const route of routes) {
        const fetch: Handler = fetcher.bind(this)(route);
        const handler = async (
          reqOrParsed: Request | Req,
          server: any
        ): Promise<Response> => {
          let req: Req;
          if (reqOrParsed instanceof Request) {
            const url = new URL(reqOrParsed.url);
            const { params } = Helper.matchPath(route.path, url.pathname);
            const rawRequest = reqOrParsed.clone();
            req = Helper.createLazyReq(reqOrParsed, params, rawRequest);
          } else {
            req = reqOrParsed;
          }
          const res = Helper.toRes();
          const result = await fetch(req, res);
          return Helper.toResponse(result);
        };
        this.routes.push({
          method: route.method as HttpMethod,
          path: route.path,
          handler,
        });
      }
    }
    this.errorHandler = error;
    return this;
  }

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
      server: any,
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
      const res = Helper.toRes();

      try {
        // Auto-parse body for backward compatibility with req.body access
        // Skip for streaming routes (they use await req.body)
        if (
          !options?.streaming &&
          (req as Req).getBody &&
          !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())
        ) {
          await (req as Req).getBody!();
        }

        const result = await handle(req as Req, res);

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

  route<T = Res, R extends Req | StreamReq = Req>(
    method: HttpMethod,
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route(method, path, handler as Handler, options);
  }

  request<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('*', path, handler as Handler, options);
  }

  get<T = Res>(path: string, handler: Handler<T>) {
    return this._route('GET', path, handler);
  }

  post<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('POST', path, handler as Handler, options);
  }

  put<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('PUT', path, handler as Handler, options);
  }

  patch<T = Res, R extends Req | StreamReq = Req>(
    path: string,
    handler: Handler<T, R>,
    options?: { streaming?: boolean }
  ) {
    return this._route('PATCH', path, handler as Handler, options);
  }

  delete(path: string, handler: Handler) {
    return this._route('DELETE', path, handler);
  }

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

  use(prefix: string, group: Class<Group>, ...args: any[]) {
    return this._use(prefix, group, ...args);
  }

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

  on(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return this;
  }

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

  private normalizePath(path: string): string {
    return '/' + path.split('/').filter(Boolean).join('/');
  }

  getCorsOptions(): Partial<CorsOptions> | undefined {
    return this.corsOptions;
  }

  getErrorHandler(): ((err: Error, req: Req) => Promise<Res>) | undefined {
    return this.errorHandler;
  }
}

/**
 * Events emitted by the {@link Server}.
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
 * A Bun-embedded HTTP server.
 */
export abstract class Application extends Group implements Server, OnStop {
  private server?: ReturnType<typeof Bun.serve>;

  async start({ host, port }: Partial<ServeOptions> = {}) {
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

      async fetch(req: Request, server): Promise<Response> {
        const url = new URL(req.url);
        const method = req.method.toUpperCase();
        const path = url.pathname;

        // Handle CORS preflight first (before any body consumption)
        if (method === 'OPTIONS' && corsOptions) {
          const response = Helper.corsResponse(corsOptions);
          self.emit('response', undefined, Helper.toRes());
          return response;
        }

        // Find matching route
        for (const route of allRoutes) {
          const routeMethod =
            route.method === '*' ? method : route.method.toUpperCase();
          if (routeMethod !== method && route.method !== '*') continue;

          const { matched, params } = Helper.matchPath(route.path, path);
          if (matched) {
            try {
              // Pass raw Request and matched params to handler
              const response = await route.handler(req, server, params);
              self.emit('response', undefined, Helper.toRes());
              return response;
            } catch (err) {
              if (!(err instanceof HttpError)) {
                logger.error(`${err.message}\n`, err);
              }
              if (errorHandler) {
                const rawRequest = req.clone();
                const errorReq = Helper.createLazyReq(req, params, rawRequest);
                const errorResult = await errorHandler(err, errorReq);
                return Helper.toResponse(errorResult);
              }
              return new Response('Internal Server Error', { status: 500 });
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
          self.emit('response', parsedReq, Helper.toRes());
          return Helper.toResponse(errorResult);
        }

        self.emit('response', undefined, Helper.toRes());
        return new Response('Not Found', { status: 404 });
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

  async stop() {
    this.emit('stop');
    if (this.server) {
      this.server.stop(true);
      this.server = undefined;
    }
    this.emit('stopped');
  }

  async onStop() {
    await this.stop();
  }

  override on(event: ServerEvent, handler: Function) {
    return super.on(event, handler);
  }

  override emit(event: ServerEvent, ...data: any[]) {
    return super.emit(event, ...data);
  }
}
