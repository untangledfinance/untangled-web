import { Obj, profiles, withName } from '../types';
import { createLogger } from '../logging';
import { HttpError } from './error';
import { ProxyOptions, ProxyStore, ProxyURL } from './proxy';
import { HttpContext } from './context';

const logger = createLogger('http');

export type HttpMethod =
  | '*'
  | 'HEAD'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS';
export type MediaType = 'text/plain' | 'application/json' | string;

export type Req<T = any> = {
  method: string;
  url?: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
  queryString?: string;
  params?: Record<string, string>;
  body?: T;
  rawBody?: string;
};

export class ReqObj<T = any> extends Obj {
  method: string;
  url?: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
  queryString?: string;
  params?: Record<string, string>;
  body?: T;
  rawBody?: string;
}

export type Res<T = any> = {
  headers?: Record<string, string | string[]>;
  data?: T;
  status?: number;
  completed?: boolean;
};

export class ResObj<T = any> extends Obj {
  headers?: Record<string, string | string[]>;
  data?: T;
  status?: number;
  completed?: boolean;
}

export type RequestHandler<R = any, T = any> = (
  req: Req<R>,
  res: Res<T>
) => Promise<Res<T> | Response>;

export enum StatusCode {
  OK = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  NotFound = 404,
  TooManyRequests = 429,
  InternalServerError = 500,
}

type RequestOptions = {
  /**
   * The request path.
   */
  path?: string;
  /**
   * The expected request content type.
   */
  consumes?: MediaType;
  /**
   * The response content type.
   */
  produces?: MediaType;
  /**
   * The response status code.
   */
  status?: number;
  /**
   * The response headers.
   */
  headers?: Record<string, string>;
  /**
   * The request's proxy options.
   */
  proxy?: ProxyOptions;
};

export type Route = {
  method: HttpMethod;
  path: string;
  handler?: Function;
  options?: RequestOptions;
  __controller__?: RouteSupport;
};

interface ProfileSupport {
  __profiles__?: string[];
}

interface RouteSupport {
  __basePath__?: string;
  __routes__?: Route[];
  __proxy__?: ProxyOptions;
}

interface DependencySupport {
  __dependencies__?: {
    [name: string]: any;
  };
}

interface ModuleSupport {
  __name__?: string;
  __controllers__?: Class<any>[];
  __providers__?: Class<any>[];
  __imports__?: Class<any>[];
}

/**
 * Only uses a {@link Controller} or a {@link Module} in some specific
 * environment profiles.
 * @param name name of the allowed profile.
 * @param others name of other allowed profiles.
 */
export function Profile(name: string, ...others: string[]) {
  if (!name) {
    throw new Error('At least one profile name must be specified');
  }
  const profiles = [...new Set([name, ...others].map((p) => p?.toLowerCase()))];
  return function <T extends Class<any>>(cls: T) {
    return withName(
      class extends cls implements ProfileSupport {
        __profiles__ = profiles;
      },
      cls.name
    );
  };
}

/**
 * Enables only for given environment.
 * @param name name of the environment (retrievable via `process.env.ENV`).
 * @see Profile
 */
export const Env = (name: string) => Profile(name);

/**
 * Marks a class as a controller.
 *
 * @param path base path.
 */
export function Controller(
  path?: string,
  options?: {
    proxy?: ProxyOptions;
  }
) {
  return function <T extends Class<any>>(cls: T) {
    return withName(
      class extends cls implements RouteSupport {
        __basePath__ = path;
        __proxy__ = options?.proxy;
      },
      cls.name
    );
  };
}

type ModuleOptions = {
  /**
   * A list of all exposable controllers.
   */
  controllers: Class<any>[];
  providers: Class<any>[];
  imports: Class<any>[];
};

/**
 * Marks a class as a module.
 *
 * @param options module options.
 */
export function Module(options: Partial<ModuleOptions> = {}) {
  return function <T extends Class<any>>(cls: T) {
    return withName(
      class extends cls implements ModuleSupport {
        __name__ = cls.name;
        __controllers__ = options.controllers || [];
        __providers__ = options.providers || [];
        __imports__ = options.imports || [];
      },
      cls.name
    );
  };
}

/**
 * Creates a Proxy decorator that uses given {@link ProxyStore}.
 * @param store the {@link ProxyStore}.
 */
export function ProxyDecorator(store: ProxyStore) {
  /**
   * Key to retrieve the target proxy URL from the {@link store}.
   */
  return function (key: string) {
    return function (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<any>
    ) {
      const routes: Route[] = (target as RouteSupport).__routes__ ?? [];
      const proxy = (target as RouteSupport).__proxy__;
      if (proxy) {
        throw new Error(
          'Could not use handler-level proxy inside a proxied controller'
        );
      }
      const found = routes.findIndex(
        (r) => r.handler?.name === descriptor.value?.name
      );
      if (found >= 0) {
        const route = routes[found];
        routes.splice(found, 1, {
          ...route,
          options: {
            ...(route.options ?? {}),
            proxy: () => store.get(key),
          },
        } as Route);
        (target as RouteSupport).__routes__ = routes;
      }
    };
  };
}

/**
 * Creates a decorator that marks a function as a request handler.
 *
 * @param method HTTP method.
 */
export function RequestDecorator(method: HttpMethod) {
  return function (path?: string, options?: Omit<RequestOptions, 'path'>) {
    return function (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<any>
    ) {
      const reqPath = path ?? '/';
      const reqOptions: RequestOptions = {
        ...(options ?? {}),
        path: reqPath,
      };
      const routes: Route[] = [
        ...((target as RouteSupport).__routes__ ?? []),
        {
          method,
          path: reqPath,
          options: reqOptions,
          handler: descriptor.value,
        },
      ];
      (target as RouteSupport).__routes__ = routes;
    };
  };
}

/**
 * Marks a function as a `GET`-request handler.
 */
export const Get = RequestDecorator('GET');
/**
 * Marks a function as a `POST`-request handler.
 */
export const Post = RequestDecorator('POST');
/**
 * Marks a function as a `PUT`-request handler.
 */
export const Put = RequestDecorator('PUT');
/**
 * Marks a function as a `DELETE`-request handler.
 */
export const Delete = RequestDecorator('DELETE');
/**
 * Marks a function as a `PATCH`-request handler.
 */
export const Patch = RequestDecorator('PATCH');
/**
 * Marks a function as a request handler for all HTTP methods.
 */
export const Request = RequestDecorator('*');

class MediaConverter {
  static mediaType(mediaType: MediaType) {
    return mediaType?.split(';')?.at(0)?.trim()?.toLowerCase();
  }

  static serialize(mediaType: MediaType, value: any) {
    switch (this.mediaType(mediaType)) {
      case 'application/json':
        return JSON.stringify(value);
    }
    return value?.toString();
  }

  static deserialize(mediaType: MediaType, value: any) {
    switch (this.mediaType(mediaType)) {
      case 'application/json':
        return value && JSON.parse(value);
    }
    return value;
  }
}

class RoutingConfigurer {
  private static normalizeRoutePath(...path: any[]): string {
    return path
      .filter((p) => !!p)
      .map((p) => '/' + p)
      .join('/')
      .replace(/\/+/g, '/');
  }

  /**
   * Generates routes for a module.
   * @param module the module.
   */
  private static createRoutes(module: ModuleSupport) {
    const currentProfiles = profiles();
    const controllers = module.__controllers__ ?? [];
    const providers = module.__providers__ ?? [];
    const imports = module.__imports__ ?? [];
    const routeMapping = {} as Record<string, Route>;
    const moduleProfiles = new Set(
      (module as ProfileSupport)['__profiles__'] ?? []
    );
    if (
      moduleProfiles.size &&
      !currentProfiles.intersection(moduleProfiles).size
    ) {
      return [];
    }
    for (const controllerClass of controllers) {
      const controller = new controllerClass();
      const controllerProfiles = new Set(
        (controller as ProfileSupport)['__profiles__'] ?? []
      );
      if (
        controllerProfiles.size &&
        !currentProfiles.intersection(controllerProfiles).size
      ) {
        continue;
      }
      const {
        __routes__: routes,
        __basePath__: basePath,
        __proxy__: proxy,
      } = controller as RouteSupport;
      // TODO: Add a `Request` route as a proxy pass if `proxy` exists
      //       In that case, all other routes should be ignored, shouldn't?
      for (const route of routes) {
        const routePath = RoutingConfigurer.normalizeRoutePath(
          ...(basePath ?? '').split('/'),
          ...[route.path ?? '']
        );
        const routeMethod = route.method.toUpperCase();
        const routeKey = `${routeMethod} ${routePath}`;
        if (routeMapping[routeKey]) {
          throw new Error(`Route ${routeKey} exists`);
        }
        if (!route.handler) {
          throw new Error(`Handler ${routeKey} not found`);
        }
        routeMapping[routeKey] = {
          ...route,
          method: routeMethod as HttpMethod,
          path: routePath,
          __controller__: controller,
        };
      }
      logger.info('Routes created', {
        module: module.__name__ ?? 'unknown',
        controller: controllerClass.name,
      });
    }
    return Object.values(routeMapping).flat();
  }

  private static errorAdvisor() {
    return async function (error: any, req?: Req): Promise<Res> {
      const { statusCode, message, code, method, path } = error as {
        statusCode: number;
        message: string;
        code: string;
        method: HttpMethod;
        path: string;
      };
      return new ResObj({
        completed: true,
        data: JSON.stringify({
          timestamp: Date.now(),
          code,
          method: method ?? req?.method,
          path: path ?? req?.path,
          message,
        }),
        status: statusCode ?? StatusCode.InternalServerError,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    };
  }

  static apply(module: ModuleSupport, ...filters: Filter[]): RouteOptions {
    return {
      routes: RoutingConfigurer.createRoutes(module),
      error: RoutingConfigurer.errorAdvisor(),
      fetcher: function (route: Route): RequestHandler {
        const { handler, options, __controller__: controller } = route;
        const contentType: MediaType = options?.produces || 'application/json';
        const headers: Record<string, string | string[]> = {
          'Content-Type': contentType,
          ...(options?.headers || {}),
        };
        const handleError = RoutingConfigurer.errorAdvisor();
        return async function (req: Req, res: Res = {}) {
          try {
            const { req: ctxReq = req } = HttpContext.get() ?? {};
            req = new ReqObj({
              ...req,
              // retain original request's url & path
              url: ctxReq.url,
              path: ctxReq.path,
            });
            const next = async (
              r: { req: ReqObj; res: ResObj },
              i = 0
            ): Promise<{ req: ReqObj; res: ResObj | Response }> => {
              if (r.res instanceof Response) return r;
              if (r.res.completed) {
                return {
                  req: new ReqObj(r.req),
                  res: new ResObj({
                    status: StatusCode.OK,
                    ...r.res,
                    headers: {
                      ...headers,
                      ...(r.res.headers ?? {}),
                    },
                  }),
                }; // no need to handle completed request
              }

              const filter = filters[i];
              if (filter) {
                const filtered = await filter(
                  new ReqObj(r.req),
                  new ResObj(r.res),
                  (rq, rs) =>
                    next({ req: new ReqObj(rq), res: new ResObj(rs) }, i + 1)
                );
                if (filtered.res instanceof Response) return filtered;
                if (filtered.res.completed)
                  return {
                    req: new ReqObj(filtered.req),
                    res: new ResObj({
                      status: StatusCode.OK,
                      ...filtered.res,
                      headers: {
                        ...headers,
                        ...(filtered.res.headers ?? {}),
                      },
                    }),
                  };
              }

              HttpContext.set({ req: new ReqObj(r.req) });

              let value = null;
              let status = options?.status;
              const proxy =
                options.proxy instanceof ProxyStore
                  ? await options.proxy.get(handler.name)
                  : options.proxy instanceof Function
                    ? options.proxy()
                    : options.proxy;
              const proxyUrl = (
                proxy instanceof Promise ? await proxy : proxy
              ) as ProxyURL;
              if (proxyUrl) {
                try {
                  const proxyHeaders = Object.entries(
                    r.req.headers ?? {}
                  ).reduce(
                    (h, [k, v]) => {
                      k = k.toLowerCase();
                      if (k !== 'host') {
                        h[k] = [v].flat();
                      }
                      return h;
                    },
                    {
                      'X-Forwarded-Path': r.req.path,
                    } as Record<string, string | string[]>
                  );
                  const proxyData = !['GET', 'OPTIONS', 'HEAD'].includes(
                    r.req.method.toUpperCase()
                  )
                    ? req.rawBody
                    : undefined;

                  let completeProxyUrl = proxyUrl.toString();
                  if (r.req.query && Object.keys(r.req.query).length > 0) {
                    const queryString = r.req.queryString?.replace(/^\?*/, '');
                    if (queryString) {
                      const separator = completeProxyUrl.includes('?')
                        ? '&'
                        : '?';
                      completeProxyUrl = `${completeProxyUrl}${separator}${queryString}`;
                    }
                  }

                  logger.debug(`Proxying`, {
                    from: `${r.req.path}${r.req.queryString || ''}`,
                    to: completeProxyUrl,
                  });
                  const proxyRes = await fetch(completeProxyUrl, {
                    method: r.req.method,
                    headers: proxyHeaders as Record<string, string>,
                    body: proxyData,
                  });
                  logger.debug(`Proxied`, {
                    to: completeProxyUrl,
                    status: proxyRes.status,
                  });

                  return {
                    req: new ReqObj(r.req),
                    res: proxyRes,
                  };
                } catch (err) {
                  logger.error(`${err.message}\n`, err);
                  throw new Error('Proxy error');
                }
              } else if (handler) {
                value = (controller ? handler.bind(controller) : handler)(
                  new ReqObj(r.req),
                  new ResObj(r.res)
                );
              }
              value = value instanceof Promise ? await value : value;
              if (value instanceof Response) {
                return {
                  req: new ReqObj(r.req),
                  res: value,
                };
              }
              const content = value
                ? MediaConverter.serialize(contentType, value)
                : null;
              return {
                req: new ReqObj(r.req),
                res: new ResObj({
                  completed: true,
                  data: content,
                  status: status ?? StatusCode.OK,
                  headers: {
                    ...headers,
                    ...(res.headers ?? {}),
                  },
                }),
              };
            };
            const r = await next({
              req: new ReqObj(req),
              res: new ResObj(res),
            });
            return r.res as ResObj | Response;
          } catch (err) {
            if (!(err instanceof HttpError)) {
              logger.error(`${err.message}\n`, err);
            }
            return handleError(err, req);
          }
        };
      },
    };
  }
}

export interface RouteOptions {
  /**
   * Existing {@link Route}s.
   */
  routes?: Omit<Route, 'handler'>[];
  /**
   * Handles {@link Error}s.
   */
  error(err: any, req?: Req): Promise<Res>;
  /**
   * Handles a {@link Route}.
   * @returns a handler to process the {@link Req}.
   */
  fetcher<T = Res>(route: Omit<Route, 'handler'>, bound?: Router): Handler<T>;
}

export interface ServeOptions extends RouteOptions {
  port?: number;
  host?: string;
}

export interface FilterOptions {
  /**
   * Applies the {@link Filter}.
   */
  guard: Filter;
  /**
   * Right before specific {@link Router}s.
   */
  before: Class<Router> | Class<Router>[];
}

export interface CorsOptions {
  allowedOrigins: string | '*' | (string | '*')[];
  allowedMethods: HttpMethod | '*' | (HttpMethod | '*')[];
  allowedHeaders: string | '*' | (string | '*')[];
  maxAge: number | string;
}

export type Next<T = any> = (
  req: Req<T>,
  res: Res,
  next?: Next<T>,
  ...args: any[]
) => Promise<{
  req: Req<T>;
  res: Res | Response;
}>;

/**
 * Filters a {@link Req}uest before actually handling it.
 */
export type Filter<T = any> = (
  req: Req<T>,
  res: Res,
  next?: Next<T>,
  ...args: any[]
) => Promise<{
  req: Req<T>;
  res: Res | Response;
}>;

export type Handler<T = Res> = (
  req: Req,
  res: Res
) => Promise<Res | Response | T>;

export interface Router {
  /**
   * Adds a {@link Filter} before routing.
   * @param options filtering options.
   */
  with(options: FilterOptions): this;
  /**
   * Adds a {@link Filter} before all routing groups.
   * @param filter the filter.
   */
  guard(filter: Filter): this;
  /**
   * Applies routing options.
   * @param options routing options.
   */
  apply(options: Partial<RouteOptions>): this;
  /**
   * Applies CORS options.
   * @param options the options.
   */
  cors(options: Partial<CorsOptions> | '*'): this;
  /**
   * Configures routing.
   * @param method the target {@link HttpMethod}.
   * @param path the path.
   * @param handler the handler.
   */
  route<T = Res>(method: HttpMethod, path: string, handler: Handler<T>): this;
  /**
   * Configures a `*` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  request<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Configures a `GET` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  get<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Configures a `POST` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  post<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Configures a `PUT` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  put<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Configures a `PATCH` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  patch<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Configures a `DELETE` routing at a specific path.
   * @param path the path.
   * @param handler the handler.
   * @see route
   */
  delete<T = Res>(path: string, handler: Handler<T>): this;
  /**
   * Uses another {@link Router} as a routing group.
   * @param prefix the routing prefix.
   * @param router the router type.
   */
  use(prefix: string, router: Class<Router>, ...args: any[]): this;
  /**
   * Uses another {@link Router} as a routing group once the server starts.
   * @param prefix the routing prefix.
   * @param router a {@link Promise} or an async function to get the router type.
   * @see on
   */
  useAsync(
    prefix: string,
    router:
      | Promise<Class<Router>>
      | (() => Class<Router> | Promise<Class<Router>>),
    ...args: any[]
  ): this;
  /**
   * Adds an event handler.
   * @param event name of the event.
   * @param handler the handler.
   */
  on(event: string, handler: Function): this;
  /**
   * Emits an event with given data.
   * @param event name of the event.
   * @param data the data.
   */
  emit(event: string, ...data: any[]): this;
}

/**
 * HTTP Server.
 */
export interface Server extends Router {
  /**
   * Starts serving.
   */
  start(options?: Partial<ServeOptions>): Promise<this>;
  /**
   * Stops serving.
   */
  stop(): Promise<void>;
}

/**
 * Automatically configures a given {@link Router} following its decorators.
 * @param router the {@link Router}.
 */
export function configure(router: Router, ...filters: Filter[]) {
  return router.apply(
    RoutingConfigurer.apply(router as ModuleSupport, ...filters)
  );
}
