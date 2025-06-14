import {
  configure,
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
  StatusCode,
} from '../core';
import { HttpError, NotFoundError } from '../error';
import { isClass, profiles } from '../../types';
import { Step } from '../../validation';
import express from 'express';
import http from 'http';
import { createLogger } from '../../logging';
import { HttpContext } from '../context';

const logger = createLogger('express');

class Mapper {
  static toReq(req: express.Request) {
    const queryStringPosition = req.url.indexOf('?');
    return {
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query as Record<string, string | string[]>,
      queryString:
        queryStringPosition >= 0 && req.url.slice(queryStringPosition),
      params: req.params,
      body: req.body,
    } as Req;
  }

  static toRes(res: express.Response) {
    return {
      status: res.statusCode ?? StatusCode.OK,
      headers: res.getHeaders(),
    } as Res;
  }

  static corsHandler(options: Partial<CorsOptions> = {}) {
    return (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const { allowedOrigins, allowedHeaders, allowedMethods, maxAge } =
        options;
      allowedOrigins &&
        res.header(
          'Access-Control-Allow-Origin',
          [allowedOrigins].flat().join(',')
        );
      allowedHeaders &&
        res.header(
          'Access-Control-Allow-Headers',
          [allowedHeaders].flat().join(',')
        );
      allowedMethods &&
        res.header(
          'Access-Control-Allow-Methods',
          [allowedMethods].flat().join(',')
        );
      res.header('Access-Control-Max-Age', (maxAge ?? '5').toString());
      res.sendStatus(StatusCode.NoContent);
    };
  }
}

export abstract class Group implements Router {
  protected router?: express.Router;
  protected corsOptions?: Partial<CorsOptions>;
  protected errorHandler?: (err: Error, req: Req) => Promise<Res>;
  private eventHandlers: Map<string, Function[]> = new Map();
  private filters: Map<Class<Router> | '*', Filter[]> = new Map();

  protected configure(...filters: Filter[]) {
    configure(this, ...(this.filters.get('*') ?? []), ...filters);
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

  /**
   * Tries sending the {@link Res}.
   */
  protected send(res: express.Response, { data, status, headers }: Res) {
    if (!res.writableEnded) {
      for (const key of Object.keys(headers ?? {})) {
        res.setHeader(key, headers[key]);
      }
      res.status(status).send(data);
    }
  }

  apply({ routes, fetcher, error }: Partial<RouteOptions>) {
    this.router = express.Router();
    if (routes?.length && fetcher) {
      for (const route of routes) {
        const fetch = fetcher.bind(this)(route);
        const handler = async (
          req: express.Request,
          res: express.Response,
          next: express.NextFunction
        ) => {
          this.send(res, await fetch(Mapper.toReq(req), Mapper.toRes(res)));
          next();
        };
        const method = route.method;
        if (method) {
          this.router[method === '*' ? 'all' : method.toLowerCase()](
            route.path,
            handler
          );
        }
      }
      this.errorHandler = error;
    }
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
  _route(method: HttpMethod, path: string, handler: Handler) {
    !this.router && this.configure();
    this.router[method.toLowerCase()](
      path,
      async (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        try {
          this.send(res, await handler(Mapper.toReq(req), Mapper.toRes(res)));
        } catch (err) {
          if (!(err instanceof HttpError)) {
            logger.error(`${err.message}\n`, err);
          }
          this.send(res, await this.errorHandler(err, Mapper.toReq(req)));
        }
        next();
      }
    );
    return this;
  }

  route(method: HttpMethod, path: string, handler: Handler) {
    return this._route(method, path, handler);
  }

  /**
   * @see {@link route}.
   */
  get(path: string, handler: Handler) {
    return this._route('GET', path, handler);
  }

  /**
   * @see {@link route}.
   */
  post(path: string, handler: Handler) {
    return this._route('POST', path, handler);
  }

  /**
   * @see {@link route}.
   */
  put(path: string, handler: Handler) {
    return this._route('PUT', path, handler);
  }

  /**
   * @see {@link route}.
   */
  patch(path: string, handler: Handler) {
    return this._route('PATCH', path, handler);
  }

  /**
   * @see {@link route}.
   */
  delete(path: string, handler: Handler) {
    return this._route('DELETE', path, handler);
  }

  @Step(2)
  _use(prefix: string, ...args: [...Filter[], Class<Group>, ...any]) {
    !this.router && this.configure();
    const filters: Filter[] = [];
    for (let i = 0; i < args.length; i++) {
      if (isClass(args[i])) {
        const group = args[i] as Class<Group>;
        const groupArgs = args.slice(i + 1);
        const g = new (class extends group {})(...groupArgs) as Group;
        !g.router &&
          g.configure(
            ...(this.filters.get('*') ?? []),
            ...filters,
            ...(this.filters.get(group) ?? [])
          );
        this.router.use(prefix, g.router);
        if (g.corsOptions) {
          this.router.options(prefix + '*', Mapper.corsHandler(g.corsOptions));
        }
        break;
      }
      filters.push(args[i] as Filter);
    }
    return this;
  }

  use(prefix: string, group: Class<Group>, ...args: any[]) {
    return this._use(prefix, group, ...args);
  }

  on(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return this;
  }

  emit(event: string, ...data: any[]) {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.forEach((handler) => handler(...data));
    return this;
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
 * An Express-embedded HTTP server.
 */
export abstract class Application extends Group implements Server {
  private server?: http.Server;

  async start({ host, port }: Partial<ServeOptions>) {
    !this.router && configure(this);
    if (this.server?.listening) {
      throw new Error('Already served!');
    }
    this.emit('start');
    const app = express()
      .options('*', Mapper.corsHandler(this.corsOptions))
      .use(express.json())
      .use(
        (
          req: express.Request,
          _: express.Response,
          next: express.NextFunction
        ) => {
          const r = Mapper.toReq(req);
          HttpContext.set({ req: r });
          this.emit('request', r);
          next();
        }
      )
      .use(this.router)
      .all(
        '*',
        async (
          _: express.Request,
          res: express.Response,
          next: express.NextFunction
        ) => {
          const { req } = HttpContext.get();
          this.errorHandler &&
            this.send(res, await this.errorHandler(new NotFoundError(), req));
          next();
        }
      )
      .use(
        (
          req: express.Request,
          res: express.Response,
          next: express.NextFunction
        ) => {
          this.emit('response', Mapper.toReq(req), Mapper.toRes(res));
          next();
        }
      );
    this.server = http.createServer(app).listen(port, host);
    this.server
      .on('listening', () =>
        this.emit('started', {
          app: {
            type: 'express',
            env: process.env.ENV,
            profiles: [...profiles()],
            host,
            port,
          },
        })
      )
      .on('error', (err: Error) => this.emit('crashed', err))
      .on('close', () => this.emit('stopped'));
    return this;
  }

  async stop() {
    this.emit('stop');
    this.server?.close();
  }

  override on(event: ServerEvent, handler: Function) {
    return super.on(event, handler);
  }

  override emit(event: ServerEvent, ...data: any[]) {
    return super.emit(event, ...data);
  }
}
