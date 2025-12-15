import { afterAll, beforeAll, describe, expect, it, test } from 'bun:test';
import type { Req, Res, StreamReq } from '../../../src/core/http/core';
import {
  PROXY_DIRECTIVE,
  isProxyDirective,
  proxyTo,
} from '../../../src/core/http/proxy';
import {
  Application as AppClass,
  Group as GroupClass,
} from '../../../src/core/http/server/bun';

// ============================================================================
// Application (Server) Integration Tests
// ============================================================================

describe('Application basic routing', () => {
  class TestApp extends AppClass {
    constructor() {
      super();
      this.get('/health', async (): Promise<Res> => {
        return {
          data: { status: 'ok' },
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        };
      });
      this.get(
        '/users/:id',
        async (req): Promise<Res> => ({
          data: { id: req.params?.id },
        })
      );
      this.post(
        '/data',
        async (req): Promise<Res> => ({
          data: { received: await req.getBody?.() },
        })
      );
    }
  }

  let app: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new TestApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('responds to health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('handles path parameters', async () => {
    const res = await fetch(`${baseUrl}/users/42`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('42');
  });

  test('handles POST with JSON body', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toEqual({ name: 'test' });
  });

  test('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });

  test('handles OPTIONS preflight requests', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
    });
    expect([200, 204, 404]).toContain(res.status);
  });
});

describe('Application with CORS', () => {
  class CorsApp extends AppClass {
    constructor() {
      super();
      this.cors({
        allowedOrigins: '*',
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
      this.get('/api', async (): Promise<Res> => {
        return {
          data: { data: 'test' },
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        };
      });
    }
  }

  let app: CorsApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new CorsApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('responds to OPTIONS with CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api`, {
      method: 'OPTIONS',
    });
    expect([200, 204]).toContain(res.status);
  });

  test('GET request works with CORS', async () => {
    const res = await fetch(`${baseUrl}/api`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBe('test');
  });
});

describe('Application with auth check in handler', () => {
  class AuthApp extends AppClass {
    constructor() {
      super();
      this.get('/secret', async (req): Promise<Res | Response> => {
        if (!req.headers?.authorization) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return { data: { secret: 'data' } };
      });
    }
  }

  let app: AuthApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new AuthApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('blocks requests without auth', async () => {
    const res = await fetch(`${baseUrl}/secret`);
    expect(res.status).toBe(401);
  });

  test('allows requests with auth', async () => {
    const res = await fetch(`${baseUrl}/secret`, {
      headers: { Authorization: 'Bearer token123' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.secret).toBe('data');
  });
});

describe('Application with error handling in route', () => {
  class ErrorApp extends AppClass {
    constructor() {
      super();
      this.get('/error', async (): Promise<Res> => {
        return {
          data: { custom: true, message: 'Handled error' },
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        };
      });
      this.get(
        '/success',
        async (): Promise<Res> => ({
          data: { ok: true },
        })
      );
    }
  }

  let app: ErrorApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new ErrorApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('returns error response from handler', async () => {
    const res = await fetch(`${baseUrl}/error`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.custom).toBe(true);
    expect(data.message).toBe('Handled error');
  });

  test('returns success response from handler', async () => {
    const res = await fetch(`${baseUrl}/success`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe('Application with sub-groups', () => {
  class ApiGroup extends GroupClass {
    constructor() {
      super();
      this.get(
        '/items',
        async (): Promise<Res> => ({
          data: { items: [] },
        })
      );
      this.get(
        '/items/:id',
        async (req): Promise<Res> => ({
          data: { item: req.params?.id },
        })
      );
    }
  }

  class AppWithGroups extends AppClass {
    constructor() {
      super();
      this.get(
        '/',
        async (): Promise<Res> => ({
          data: { root: true },
        })
      );
      this.use('/api', ApiGroup);
    }
  }

  let app: AppWithGroups;
  let baseUrl: string;

  beforeAll(async () => {
    app = new AppWithGroups();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('responds at root path', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.root).toBe(true);
  });

  test('responds at sub-group paths', async () => {
    const res = await fetch(`${baseUrl}/api/items`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([]);
  });

  test('handles path params in sub-groups', async () => {
    const res = await fetch(`${baseUrl}/api/items/123`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.item).toBe('123');
  });
});

describe('Application request/response types', () => {
  class TypedApp extends AppClass {
    constructor() {
      super();
      this.get('/redirect', async (): Promise<Response> => {
        return new Response(null, {
          status: 302,
          headers: { Location: '/target' },
        });
      });
      this.get('/res-object', async (): Promise<Res> => {
        return {
          data: { ok: true },
          status: 201,
          headers: { 'X-Custom': 'header' },
        };
      });
      this.get('/null', async (): Promise<Res> => {
        return { status: 204 };
      });
      this.get('/string', async (): Promise<Res> => {
        return { data: 'plain text' };
      });
    }
  }

  let app: TypedApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new TypedApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('handles native Response returns', async () => {
    const res = await fetch(`${baseUrl}/redirect`, { redirect: 'manual' });
    expect(res.status).toBe(302);
  });

  test('includes custom headers from Res', async () => {
    const res = await fetch(`${baseUrl}/res-object`);
    expect(res.headers.get('X-Custom')).toBe('header');
  });

  test('returns 204 for null', async () => {
    const res = await fetch(`${baseUrl}/null`);
    expect(res.status).toBe(204);
  });

  test('returns plain text for strings', async () => {
    const res = await fetch(`${baseUrl}/string`);
    const text = await res.text();
    expect(text).toContain('plain text');
  });
});

describe('Application with query parameters', () => {
  class QueryApp extends AppClass {
    constructor() {
      super();
      this.get('/search', async (req): Promise<Res> => {
        return {
          data: {
            query: req.query,
            queryString: req.queryString,
          },
        };
      });
    }
  }

  let app: QueryApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new QueryApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('parses single query parameters', async () => {
    const res = await fetch(`${baseUrl}/search?name=test&value=123`);
    const data = await res.json();
    expect(data.query.name).toBe('test');
    expect(data.query.value).toBe('123');
  });

  test('parses array query parameters', async () => {
    const res = await fetch(`${baseUrl}/search?tags=a&tags=b&tags=c`);
    const data = await res.json();
    expect(data.query.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('Application with different content types', () => {
  class ContentTypeApp extends AppClass {
    constructor() {
      super();
      this.post(
        '/json',
        async (req): Promise<Res> => ({
          data: {
            type: 'json',
            body: await req.getBody?.(),
            parser: req.bodyParser,
          },
        })
      );
      this.post(
        '/form',
        async (req): Promise<Res> => ({
          data: {
            type: 'form',
            body: await req.getBody?.(),
            parser: req.bodyParser,
          },
        })
      );
      this.post(
        '/text',
        async (req): Promise<Res> => ({
          data: {
            type: 'text',
            body: await req.getBody?.(),
            parser: req.bodyParser,
          },
        })
      );
    }
  }

  let app: ContentTypeApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new ContentTypeApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('parses JSON content type', async () => {
    const res = await fetch(`${baseUrl}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'value' }),
    });
    const data = await res.json();
    expect(data.type).toBe('json');
    expect(data.body.key).toBe('value');
  });

  test('parses form-urlencoded content type', async () => {
    const res = await fetch(`${baseUrl}/form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'field1=value1&field2=value2',
    });
    const data = await res.json();
    expect(data.type).toBe('form');
    expect(data.body.field1).toBe('value1');
    expect(data.body.field2).toBe('value2');
  });

  test('parses text content type', async () => {
    const res = await fetch(`${baseUrl}/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Hello, World!',
    });
    const data = await res.json();
    expect(data.type).toBe('text');
    expect(data.body).toBe('Hello, World!');
  });
});

// ============================================
// Streaming Proxy Tests
// ============================================

describe('proxyTo helper function', () => {
  it('creates a ProxyDirective with minimal options', () => {
    const directive = proxyTo('https://api.example.com/data');

    expect(isProxyDirective(directive)).toBe(true);
    expect(directive[PROXY_DIRECTIVE]).toBe(true);
    expect(directive.url).toBe('https://api.example.com/data');
    expect(directive.forwardBody).toBe(true);
    expect(directive.forwardQuery).toBe(true);
  });

  it('creates a ProxyDirective with custom headers', () => {
    const directive = proxyTo('https://api.example.com/data', {
      headers: {
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'value',
      },
    });

    expect(directive.headers).toEqual({
      Authorization: 'Bearer token123',
      'X-Custom-Header': 'value',
    });
  });

  it('creates a ProxyDirective with method override', () => {
    const directive = proxyTo('https://api.example.com/data', {
      method: 'POST',
    });

    expect(directive.method).toBe('POST');
  });

  it('creates a ProxyDirective with forwardBody disabled', () => {
    const directive = proxyTo('https://api.example.com/data', {
      forwardBody: false,
    });

    expect(directive.forwardBody).toBe(false);
  });

  it('creates a ProxyDirective with forwardQuery disabled', () => {
    const directive = proxyTo('https://api.example.com/data', {
      forwardQuery: false,
    });

    expect(directive.forwardQuery).toBe(false);
  });

  it('creates a ProxyDirective with excludeHeaders', () => {
    const directive = proxyTo('https://api.example.com/data', {
      excludeHeaders: ['cookie', 'authorization'],
    });

    expect(directive.excludeHeaders).toEqual(['cookie', 'authorization']);
  });

  it('accepts URL object as target', () => {
    const url = new URL('https://api.example.com/data');
    const directive = proxyTo(url);

    expect(directive.url).toBe(url);
  });
});

describe('isProxyDirective type guard', () => {
  it('returns true for valid ProxyDirective', () => {
    const directive = proxyTo('https://example.com');
    expect(isProxyDirective(directive)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isProxyDirective(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isProxyDirective(undefined)).toBe(false);
  });

  it('returns false for plain object', () => {
    expect(isProxyDirective({ url: 'https://example.com' })).toBe(false);
  });

  it('returns false for string', () => {
    expect(isProxyDirective('https://example.com')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isProxyDirective(123)).toBe(false);
  });

  it('returns false for array', () => {
    expect(isProxyDirective([])).toBe(false);
  });

  it('returns false for Response object', () => {
    expect(isProxyDirective(new Response())).toBe(false);
  });
});

describe('Application with streaming proxy directive', () => {
  let app: AppClass;
  let baseUrl: string;
  let targetApp: AppClass;
  let targetBaseUrl: string;

  beforeAll(async () => {
    // Create target server that will receive proxied requests
    class TargetApp extends AppClass {
      constructor() {
        super();
        this.get('/data', async (req: Req): Promise<Res> => {
          return {
            data: {
              message: 'Hello from target',
              receivedHeaders: req.headers,
              receivedQuery: req.query,
            },
          };
        });

        this.post('/echo', async (req: Req): Promise<Res> => {
          return {
            data: {
              receivedBody: await req.getBody?.(),
              receivedHeaders: req.headers,
            },
          };
        });

        this.get('/large-response', async (): Promise<Res> => {
          // Simulate a large response
          const largeData = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            value: `item-${i}`,
          }));
          return { data: largeData };
        });
      }
    }

    targetApp = new TargetApp();
    await targetApp.start({ port: 0 });
    targetBaseUrl = `http://localhost:${(targetApp as any).server.port}`;

    // Create proxy server that uses proxyTo directive
    // We need to create a class that captures targetBaseUrl after it's set
    class ProxyApp extends AppClass {
      constructor(private targetUrl: string) {
        super();
        this.get('/proxy/data', async (req: Req) => {
          return proxyTo(`${this.targetUrl}/data`);
        });

        this.post('/proxy/echo', async (req: Req) => {
          return proxyTo(`${this.targetUrl}/echo`);
        });

        this.get('/proxy/large', async (req: Req) => {
          return proxyTo(`${this.targetUrl}/large-response`);
        });

        this.get('/proxy/with-headers', async (req: Req) => {
          return proxyTo(`${this.targetUrl}/data`, {
            headers: {
              'X-Custom-Proxy-Header': 'custom-value',
            },
          });
        });

        this.get(
          '/conditional-proxy',
          async (req: Req): Promise<Res | ReturnType<typeof proxyTo>> => {
            if (req.query?.proxy === 'true') {
              return proxyTo(`${this.targetUrl}/data`);
            }
            return { data: { message: 'Local response' } };
          }
        );
      }
    }

    app = new ProxyApp(targetBaseUrl);
    await app.start({ port: 0 });
    baseUrl = `http://localhost:${(app as any).server.port}`;
  });

  afterAll(async () => {
    await app.stop();
    await targetApp.stop();
  });

  it('has routes registered', async () => {
    const routes = (app as any).getAllRoutes();
    expect(routes.length).toBeGreaterThan(0);
  });

  it('proxies GET request to target server', async () => {
    const response = await fetch(`${baseUrl}/proxy/data`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Hello from target');
  });

  it('forwards query parameters to target', async () => {
    const response = await fetch(`${baseUrl}/proxy/data?foo=bar&baz=qux`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receivedQuery?.foo).toBe('bar');
    expect(data.receivedQuery?.baz).toBe('qux');
  });

  it('proxies POST request with body', async () => {
    const response = await fetch(`${baseUrl}/proxy/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receivedBody?.test).toBe('data');
  });

  it('handles large responses via streaming', async () => {
    const response = await fetch(`${baseUrl}/proxy/large`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1000);
    expect(data[0]).toEqual({ id: 0, value: 'item-0' });
    expect(data[999]).toEqual({ id: 999, value: 'item-999' });
  });

  it('adds custom headers when proxying', async () => {
    const response = await fetch(`${baseUrl}/proxy/with-headers`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receivedHeaders?.['x-custom-proxy-header']).toBe(
      'custom-value'
    );
  });

  it('forwards X-Forwarded-Path header', async () => {
    const response = await fetch(`${baseUrl}/proxy/data`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receivedHeaders?.['x-forwarded-path']).toBe('/proxy/data');
  });

  it('conditionally proxies based on logic', async () => {
    // When proxy=true, should proxy to target
    const proxyResponse = await fetch(
      `${baseUrl}/conditional-proxy?proxy=true`
    );
    const proxyData = await proxyResponse.json();
    expect(proxyData.message).toBe('Hello from target');

    // When proxy is not set, should return local response
    const localResponse = await fetch(`${baseUrl}/conditional-proxy`);
    const localData = await localResponse.json();
    expect(localData.message).toBe('Local response');
  });
});

describe('Streaming proxy without body consumption', () => {
  let app: AppClass;
  let baseUrl: string;
  let targetApp: AppClass;
  let targetBaseUrl: string;
  let bodyAccessedOnProxy = false;

  beforeAll(async () => {
    // Target server
    class TargetServer extends AppClass {
      constructor() {
        super();
        this.post('/echo', async (req: Req): Promise<Res> => {
          const body = await req.getBody?.();
          return { data: { received: body } };
        });
      }
    }
    targetApp = new TargetServer();
    await targetApp.start({ port: 0 });
    targetBaseUrl = `http://localhost:${(targetApp as any).server.port}`;

    // Proxy server that does NOT access body - uses streaming option
    class ProxyServer extends AppClass {
      constructor() {
        super();
        this.post(
          '/proxy-no-body-access',
          async (req: StreamReq) => {
            // For StreamReq, body is a Promise - check it's not resolved yet
            // by checking if it's a Promise (not already awaited)
            bodyAccessedOnProxy = !(req.body instanceof Promise);
            return proxyTo(`${targetBaseUrl}/echo`);
          },
          { streaming: true }
        );
      }
    }
    app = new ProxyServer();
    await app.start({ port: 0 });
    baseUrl = `http://localhost:${(app as any).server.port}`;
  });

  afterAll(async () => {
    await app.stop();
    await targetApp.stop();
  });

  it('does not parse body when handler returns proxyTo without accessing body', async () => {
    bodyAccessedOnProxy = false;

    const response = await fetch(`${baseUrl}/proxy-no-body-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'streaming' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    // Body should NOT have been parsed on proxy server
    expect(bodyAccessedOnProxy).toBe(false);
    // Target server should have received the body via streaming
    expect(data.received).toEqual({ test: 'streaming' });
  });
});

describe('StreamReq with await req.body', () => {
  let app: AppClass;
  let baseUrl: string;

  beforeAll(async () => {
    class StreamApp extends AppClass {
      constructor() {
        super();
        // Streaming route with await req.body
        this.post(
          '/stream-body',
          async (req: StreamReq) => {
            const body = await req.body;
            return { data: { received: body } };
          },
          { streaming: true }
        );

        // Streaming route with await req.files
        this.post(
          '/stream-files',
          async (req: StreamReq) => {
            const files = await req.files;
            return {
              data: {
                filesCount: files?.length ?? 0,
                fileNames: files?.map((f) => f.filename) ?? [],
              },
            };
          },
          { streaming: true }
        );
      }
    }
    app = new StreamApp();
    await app.start({ port: 0 });
    baseUrl = `http://localhost:${(app as any).server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it('parses JSON body with await req.body', async () => {
    const response = await fetch(`${baseUrl}/stream-body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test', value: 123 }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toEqual({ name: 'test', value: 123 });
  });

  it('parses form body with await req.body', async () => {
    const response = await fetch(`${baseUrl}/stream-body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'key1=value1&key2=value2',
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('parses files with await req.files', async () => {
    const formData = new FormData();
    formData.append(
      'file1',
      new Blob(['content1'], { type: 'text/plain' }),
      'test1.txt'
    );
    formData.append(
      'file2',
      new Blob(['content2'], { type: 'text/plain' }),
      'test2.txt'
    );

    const response = await fetch(`${baseUrl}/stream-files`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.filesCount).toBe(2);
    expect(data.fileNames).toContain('test1.txt');
    expect(data.fileNames).toContain('test2.txt');
  });
});

describe('Lazy body parsing', () => {
  let app: AppClass;
  let baseUrl: string;

  beforeAll(async () => {
    class BodyApp extends AppClass {
      constructor() {
        super();
        // This handler uses getBody() for lazy parsing
        this.post('/with-body', async (req: Req): Promise<Res> => {
          return { data: { receivedBody: await req.getBody?.() } };
        });

        // Verify body is available after getBody() is called
        this.post('/check-body', async (req: Req): Promise<Res> => {
          const body = await req.getBody?.();
          return {
            data: {
              bodyDefined: body !== undefined,
              bodyValue: body,
            },
          };
        });

        // Verify body is undefined BEFORE getBody() is called (truly lazy)
        this.post(
          '/check-body-before-parse',
          async (req: Req): Promise<Res> => {
            // Access req.body directly WITHOUT calling getBody() first
            const bodyBeforeParse = req.body;
            // Now call getBody() to parse
            const bodyAfterParse = await req.getBody?.();
            return {
              data: {
                bodyBeforeParse,
                bodyAfterParse,
                wasUndefinedBefore: bodyBeforeParse === undefined,
                isDefinedAfter: bodyAfterParse !== undefined,
              },
            };
          }
        );
      }
    }

    app = new BodyApp();
    await app.start({ port: 0 });
    baseUrl = `http://localhost:${(app as any).server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it('body is available after calling getBody()', async () => {
    const response = await fetch(`${baseUrl}/check-body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bodyDefined).toBe(true);
    expect(data.bodyValue).toEqual({ test: 'data' });
  });

  it('getBody() parses JSON correctly', async () => {
    const response = await fetch(`${baseUrl}/with-body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receivedBody).toEqual({ name: 'test' });
  });

  it('body is undefined before getBody() is called (truly lazy)', async () => {
    const response = await fetch(`${baseUrl}/check-body-before-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lazy: 'test' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    // Body should be undefined BEFORE getBody() is called
    expect(data.wasUndefinedBefore).toBe(true);
    expect(data.bodyBeforeParse).toBeUndefined();
    // Body should be defined AFTER getBody() is called
    expect(data.isDefinedAfter).toBe(true);
    expect(data.bodyAfterParse).toEqual({ lazy: 'test' });
  });
});

describe('Application with streaming proxy to unavailable target', () => {
  let app: AppClass;
  let baseUrl: string;

  beforeAll(async () => {
    class UnavailableProxyApp extends AppClass {
      constructor() {
        super();
        this.get('/proxy/unavailable', async (req: Req) => {
          // Proxy to a non-existent server
          return proxyTo('http://localhost:59999/not-found');
        });
      }
    }
    app = new UnavailableProxyApp();
    await app.start({ port: 0 });
    baseUrl = `http://localhost:${(app as any).server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it('returns 502 Bad Gateway when target is unavailable', async () => {
    const response = await fetch(`${baseUrl}/proxy/unavailable`);

    expect(response.status).toBe(502);
  });
});

describe('Application with file uploads', () => {
  class UploadApp extends AppClass {
    constructor() {
      super();
      this.post(
        '/upload',
        async (req): Promise<Res> => ({
          data: {
            filesCount: (await req.getFiles?.())?.length ?? 0,
            fields: await req.getBody?.(),
          },
        })
      );
    }
  }

  let app: UploadApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new UploadApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('handles file upload with form fields', async () => {
    const formData = new FormData();
    formData.append('name', 'test');
    formData.append('description', 'A test file');
    formData.append(
      'file',
      new Blob(['test content'], { type: 'text/plain' }),
      'test.txt'
    );

    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    expect(data.filesCount).toBe(1);
  });

  test('handles multiple file uploads', async () => {
    const formData = new FormData();
    formData.append('file1', new Blob(['a']), 'a.txt');
    formData.append('file2', new Blob(['b']), 'b.txt');

    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    expect(data.filesCount).toBe(2);
  });
});

describe('Application with nested groups', () => {
  class UsersGroup extends GroupClass {
    constructor() {
      super();
      this.get(
        '/',
        async (): Promise<Res> => ({
          data: { users: [] },
        })
      );
      this.get(
        '/:id',
        async (req): Promise<Res> => ({
          data: { user: req.params?.id },
        })
      );
    }
  }

  class PostsGroup extends GroupClass {
    constructor() {
      super();
      this.get(
        '/',
        async (): Promise<Res> => ({
          data: { posts: [] },
        })
      );
      this.get(
        '/:id',
        async (req): Promise<Res> => ({
          data: { post: req.params?.id },
        })
      );
    }
  }

  class V1ApiGroup extends GroupClass {
    constructor() {
      super();
      this.use('/users', UsersGroup);
      this.use('/posts', PostsGroup);
    }
  }

  class NestedApp extends AppClass {
    constructor() {
      super();
      this.use('/api/v1', V1ApiGroup);
    }
  }

  let app: NestedApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new NestedApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('routes to deeply nested users group', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toEqual([]);
  });

  test('routes to deeply nested posts group', async () => {
    const res = await fetch(`${baseUrl}/api/v1/posts`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toEqual([]);
  });

  test('handles path params in nested groups', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users/456`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBe('456');
  });
});

describe('Application HTTP methods', () => {
  class MethodsApp extends AppClass {
    constructor() {
      super();
      this.get(
        '/resource',
        async (): Promise<Res> => ({
          data: { method: 'GET' },
        })
      );
      this.post(
        '/resource',
        async (): Promise<Res> => ({
          data: { method: 'POST' },
        })
      );
      this.put(
        '/resource',
        async (): Promise<Res> => ({
          data: { method: 'PUT' },
        })
      );
      this.patch(
        '/resource',
        async (): Promise<Res> => ({
          data: { method: 'PATCH' },
        })
      );
      this.delete(
        '/resource',
        async (): Promise<Res> => ({
          data: { method: 'DELETE' },
        })
      );
    }
  }

  let app: MethodsApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new MethodsApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('handles GET request', async () => {
    const res = await fetch(`${baseUrl}/resource`);
    const data = await res.json();
    expect(data.method).toBe('GET');
  });

  test('handles POST request', async () => {
    const res = await fetch(`${baseUrl}/resource`, { method: 'POST' });
    const data = await res.json();
    expect(data.method).toBe('POST');
  });

  test('handles PUT request', async () => {
    const res = await fetch(`${baseUrl}/resource`, { method: 'PUT' });
    const data = await res.json();
    expect(data.method).toBe('PUT');
  });

  test('handles PATCH request', async () => {
    const res = await fetch(`${baseUrl}/resource`, { method: 'PATCH' });
    const data = await res.json();
    expect(data.method).toBe('PATCH');
  });

  test('handles DELETE request', async () => {
    const res = await fetch(`${baseUrl}/resource`, { method: 'DELETE' });
    const data = await res.json();
    expect(data.method).toBe('DELETE');
  });
});

describe('Group standalone tests', () => {
  class TestGroup extends GroupClass {
    constructor() {
      super();
      this.get(
        '/hello',
        async (): Promise<Res> => ({
          data: { message: 'Hello' },
        })
      );
      this.post(
        '/echo',
        async (req): Promise<Res> => ({
          data: { received: await req.getBody?.() },
        })
      );
      this.get(
        '/users/:userId',
        async (req): Promise<Res> => ({
          data: { userId: req.params?.userId },
        })
      );
    }
  }

  test('getAllRoutes returns registered routes', async () => {
    const group = new TestGroup();
    const routes = group.getAllRoutes();
    expect(routes.length).toBe(3);
  });

  test('routes have correct methods', async () => {
    const group = new TestGroup();
    const routes = group.getAllRoutes();
    const methods = routes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });

  test('routes have correct paths', async () => {
    const group = new TestGroup();
    const routes = group.getAllRoutes();
    const paths = routes.map((r) => r.path);
    expect(paths).toContain('/hello');
    expect(paths).toContain('/echo');
    expect(paths).toContain('/users/:userId');
  });
});

describe('Group with CORS and guards', () => {
  class GuardedGroup extends GroupClass {
    constructor() {
      super();
      this.cors({
        allowedOrigins: ['http://localhost'],
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
      });
      this.guard(async (req, res, next) => {
        return next ? next(req, res) : { req, res };
      });
      this.get(
        '/protected',
        async (): Promise<Res> => ({
          data: {
            data: 'protected',
            filtered: true,
          },
        })
      );
    }
  }

  test('getCorsOptions returns configured CORS', () => {
    const group = new GuardedGroup();
    const corsOptions = group.getCorsOptions();
    expect(corsOptions?.allowedOrigins).toContain('http://localhost');
    expect(corsOptions?.allowedMethods).toContain('GET');
  });
});

describe('Application with status codes', () => {
  class StatusApp extends AppClass {
    constructor() {
      super();
      this.post(
        '/create',
        async (req): Promise<Res> => ({
          data: { id: 'new-id' },
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      this.get(
        '/no-content',
        async (): Promise<Res> => ({
          status: 204,
        })
      );
      this.get(
        '/bad-request',
        async (): Promise<Res> => ({
          data: { error: 'Bad Request' },
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  }

  let app: StatusApp;
  let baseUrl: string;

  beforeAll(async () => {
    app = new StatusApp();
    await app.start({ port: 0 });
    const server = (app as any).server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  test('returns 201 Created', async () => {
    const res = await fetch(`${baseUrl}/create`, { method: 'POST' });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('new-id');
  });

  test('returns 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/no-content`);
    expect(res.status).toBe(204);
  });

  test('returns 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/bad-request`);
    expect(res.status).toBe(400);
  });
});
