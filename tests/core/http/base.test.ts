import { describe, expect, test } from 'bun:test';

// ============================================================================
// Helper functions for testing (mirrors internal Helper class logic)
// ============================================================================

async function parseRequest(req: Request, params: Record<string, string> = {}) {
  const url = new URL(req.url);
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

  let body: any = undefined;
  let rawBody: string | undefined = undefined;
  let bodyParser: string | undefined = undefined;
  let files: any[] | undefined = undefined;
  const contentType = req.headers.get('content-type') || '';

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      if (contentType.includes('multipart/form-data')) {
        bodyParser = 'multipart';
        const formData = await req.formData();
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
      } else {
        const clonedReq = req.clone();
        rawBody = await clonedReq.text();
        if (contentType.includes('application/json')) {
          bodyParser = 'json';
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = rawBody;
          }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
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
    } catch {}
  }

  return {
    method: req.method,
    path: url.pathname,
    headers,
    query,
    queryString: url.search || false,
    params,
    body,
    rawBody,
    bodyParser,
    encoding: 'utf8',
    files,
  };
}

function matchPath(
  pattern: string,
  path: string
): { matched: boolean; params: Record<string, string> } {
  const params: Record<string, string> = {};

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

function toResponse(res: any): Response {
  if (res instanceof Response) {
    return res;
  }

  const isResObject =
    res &&
    typeof res === 'object' &&
    ('data' in res || 'status' in res || 'completed' in res);

  if (isResObject) {
    const { data, status, headers } = res;
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
        body = data;
      }
    }

    return new Response(body, {
      status: status ?? 200,
      headers: responseHeaders,
    });
  }

  if (res === undefined || res === null) {
    return new Response(null, { status: 204 });
  }

  if (typeof res === 'string') {
    return new Response(res, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsResponse(options: any = {}): Response {
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

  return new Response(null, { status: 204, headers });
}

// ============================================================================
// StatusCode enum (mirrors core.ts)
// ============================================================================

enum StatusCode {
  OK = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  NotFound = 404,
  TooManyRequests = 429,
  InternalServerError = 500,
}

// ============================================================================
// HttpError classes (mirrors error.ts)
// ============================================================================

class HttpError extends Error {
  statusCode: number;
  code?: string;
  method?: string;
  path?: string;

  constructor(
    statusCode: number,
    message?: string,
    code?: string,
    method?: string,
    path?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.method = method;
    this.path = path;
  }
}

class NotFoundError extends HttpError {
  constructor(message?: string, code?: string, method?: string, path?: string) {
    super(StatusCode.NotFound, message ?? 'Not Found', code, method, path);
  }
}

class BadRequestError extends HttpError {
  constructor(message?: string, code?: string, method?: string, path?: string) {
    super(StatusCode.BadRequest, message ?? 'Bad Request', code, method, path);
  }
}

class UnauthorizedError extends HttpError {
  constructor(message?: string, code?: string, method?: string, path?: string) {
    super(
      StatusCode.Unauthorized,
      message ?? 'Unauthorized',
      code,
      method,
      path
    );
  }
}

class TooManyRequestsError extends HttpError {
  constructor(message?: string, code?: string, method?: string, path?: string) {
    super(
      StatusCode.TooManyRequests,
      message ?? 'TooManyRequests',
      code,
      method,
      path
    );
  }
}

// ============================================================================
// Request Parsing Tests
// ============================================================================

describe('Request Parsing (toReq)', () => {
  test('parses URL and path correctly', async () => {
    const req = new Request('http://localhost:3000/api/users');
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/api/users');
  });

  test('parses query parameters', async () => {
    const req = new Request('http://localhost:3000/search?q=hello&limit=10');
    const parsed = await parseRequest(req);

    expect(parsed.query.q).toBe('hello');
    expect(parsed.query.limit).toBe('10');
    expect(parsed.queryString).toBe('?q=hello&limit=10');
  });

  test('parses multiple values for same query key as array', async () => {
    const req = new Request('http://localhost:3000/filter?tag=a&tag=b&tag=c');
    const parsed = await parseRequest(req);

    expect(parsed.query.tag).toEqual(['a', 'b', 'c']);
  });

  test('parses headers', async () => {
    const req = new Request('http://localhost:3000/api', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      },
    });
    const parsed = await parseRequest(req);

    expect(parsed.headers['content-type']).toBe('application/json');
    expect(parsed.headers['authorization']).toBe('Bearer token123');
    expect(parsed.headers['x-custom-header']).toBe('custom-value');
  });

  test('parses JSON body', async () => {
    const body = { name: 'John', age: 30 };
    const req = new Request('http://localhost:3000/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toEqual(body);
    expect(parsed.bodyParser).toBe('json');
  });

  test('parses URL-encoded body', async () => {
    const req = new Request('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=john&password=secret',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toEqual({ username: 'john', password: 'secret' });
    expect(parsed.bodyParser).toBe('urlencoded');
  });

  test('parses text body', async () => {
    const req = new Request('http://localhost:3000/api/text', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Hello, World!',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toBe('Hello, World!');
    expect(parsed.bodyParser).toBe('text');
  });

  test('parses multipart/form-data with files', async () => {
    const formData = new FormData();
    formData.append('name', 'John');
    formData.append(
      'file',
      new Blob(['file content'], { type: 'text/plain' }),
      'test.txt'
    );

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(parsed.body.name).toBe('John');
    expect(parsed.files).toBeDefined();
    expect(parsed.files?.length).toBe(1);
    expect(parsed.files?.[0].name).toBe('file');
    expect(parsed.files?.[0].filename).toBe('test.txt');
    expect(parsed.files?.[0].type).toContain('text/plain');
  });

  test('parses multipart/form-data with multiple files', async () => {
    const formData = new FormData();
    formData.append(
      'doc1',
      new Blob(['content1'], { type: 'text/plain' }),
      'file1.txt'
    );
    formData.append(
      'doc2',
      new Blob(['content2'], { type: 'text/plain' }),
      'file2.txt'
    );

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(parsed.files?.length).toBe(2);
    expect(parsed.files?.[0].name).toBe('doc1');
    expect(parsed.files?.[1].name).toBe('doc2');
  });

  test('includes path params when provided', async () => {
    const req = new Request('http://localhost:3000/users/123');
    const parsed = await parseRequest(req, { id: '123' });

    expect(parsed.params.id).toBe('123');
  });

  test('does not parse body for GET requests', async () => {
    const req = new Request('http://localhost:3000/api?data=value');
    const parsed = await parseRequest(req);

    expect(parsed.body).toBeUndefined();
    expect(parsed.bodyParser).toBeUndefined();
  });

  test('does not parse body for HEAD requests', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'HEAD',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toBeUndefined();
  });
});

// ============================================================================
// Path Matching Tests
// ============================================================================

describe('Path Matching (matchPath)', () => {
  test('matches exact paths', () => {
    const result = matchPath('/api/users', '/api/users');
    expect(result.matched).toBe(true);
    expect(result.params).toEqual({});
  });

  test('does not match different paths', () => {
    const result = matchPath('/api/users', '/api/posts');
    expect(result.matched).toBe(false);
  });

  test('extracts single path parameter', () => {
    const result = matchPath('/users/:id', '/users/123');
    expect(result.matched).toBe(true);
    expect(result.params).toEqual({ id: '123' });
  });

  test('extracts multiple path parameters', () => {
    const result = matchPath(
      '/users/:userId/posts/:postId',
      '/users/1/posts/42'
    );
    expect(result.matched).toBe(true);
    expect(result.params).toEqual({ userId: '1', postId: '42' });
  });

  test('does not match when segment count differs', () => {
    const result = matchPath('/api/users', '/api/users/123');
    expect(result.matched).toBe(false);
  });

  test('matches wildcard patterns', () => {
    const result = matchPath('/api/*', '/api/anything/here');
    expect(result.matched).toBe(true);
  });

  test('does not match wildcard when prefix differs', () => {
    const result = matchPath('/api/*', '/other/path');
    expect(result.matched).toBe(false);
  });

  test('handles root path', () => {
    const result = matchPath('/', '/');
    expect(result.matched).toBe(true);
  });

  test('handles trailing slashes', () => {
    const result = matchPath('/api/users', '/api/users');
    expect(result.matched).toBe(true);
  });
});

// ============================================================================
// Response Conversion Tests
// ============================================================================

describe('Response Conversion (toResponse)', () => {
  test('passes through native Response objects', () => {
    const original = new Response('test', { status: 201 });
    const result = toResponse(original);
    expect(result).toBe(original);
  });

  test('serializes Res object with data', async () => {
    const res = {
      data: { message: 'success' },
      status: 200,
      headers: { 'X-Custom': 'value' },
    };
    const result = toResponse(res);

    expect(result.status).toBe(200);
    expect(result.headers.get('X-Custom')).toBe('value');
    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(await result.json()).toEqual({ message: 'success' });
  });

  test('handles Res object without data', async () => {
    const res = {
      status: 204,
      headers: {},
    };
    const result = toResponse(res);

    expect(result.status).toBe(204);
  });

  test('returns 204 for null/undefined', () => {
    expect(toResponse(null).status).toBe(204);
    expect(toResponse(undefined).status).toBe(204);
  });

  test('serializes plain string as text/plain', async () => {
    const result = toResponse('Hello World');

    expect(result.status).toBe(200);
    expect(result.headers.get('Content-Type')).toBe('text/plain');
    expect(await result.text()).toBe('Hello World');
  });

  test('serializes object as JSON', async () => {
    const data = { foo: 'bar', num: 42 };
    const result = toResponse(data);

    expect(result.status).toBe(200);
    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(await result.json()).toEqual(data);
  });

  test('serializes array as JSON', async () => {
    const data = [1, 2, 3, 'four'];
    const result = toResponse(data);

    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(await result.json()).toEqual(data);
  });

  test('uses custom status from Res object', async () => {
    const res = {
      data: { error: 'Not Found' },
      status: 404,
      headers: {},
    };
    const result = toResponse(res);

    expect(result.status).toBe(404);
  });

  test('preserves custom headers from Res object', () => {
    const res = {
      data: 'test',
      status: 200,
      headers: {
        'X-Request-Id': '12345',
        'Cache-Control': 'no-cache',
      },
    };
    const result = toResponse(res);

    expect(result.headers.get('X-Request-Id')).toBe('12345');
    expect(result.headers.get('Cache-Control')).toBe('no-cache');
  });
});

// ============================================================================
// CORS Response Tests
// ============================================================================

describe('CORS Response (corsResponse)', () => {
  test('creates CORS response with default options', () => {
    const result = corsResponse({});
    expect(result.status).toBe(204);
  });

  test('sets Access-Control-Allow-Origin header', () => {
    const result = corsResponse({ allowedOrigins: 'https://example.com' });
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://example.com'
    );
  });

  test('joins multiple origins', () => {
    const result = corsResponse({
      allowedOrigins: ['https://a.com', 'https://b.com'],
    });
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://a.com,https://b.com'
    );
  });

  test('sets Access-Control-Allow-Methods header', () => {
    const result = corsResponse({ allowedMethods: ['GET', 'POST', 'PUT'] });
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET,POST,PUT'
    );
  });

  test('sets Access-Control-Allow-Headers header', () => {
    const result = corsResponse({
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    expect(result.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type,Authorization'
    );
  });

  test('sets Access-Control-Max-Age header', () => {
    const result = corsResponse({ maxAge: 3600 });
    expect(result.headers.get('Access-Control-Max-Age')).toBe('3600');
  });

  test('uses default maxAge of 5', () => {
    const result = corsResponse({});
    expect(result.headers.get('Access-Control-Max-Age')).toBe('5');
  });
});

// ============================================================================
// StatusCode Tests
// ============================================================================

describe('StatusCode', () => {
  test('has correct OK value', () => {
    expect(StatusCode.OK).toBe(200);
  });

  test('has correct Created value', () => {
    expect(StatusCode.Created).toBe(201);
  });

  test('has correct NoContent value', () => {
    expect(StatusCode.NoContent).toBe(204);
  });

  test('has correct BadRequest value', () => {
    expect(StatusCode.BadRequest).toBe(400);
  });

  test('has correct Unauthorized value', () => {
    expect(StatusCode.Unauthorized).toBe(401);
  });

  test('has correct NotFound value', () => {
    expect(StatusCode.NotFound).toBe(404);
  });

  test('has correct TooManyRequests value', () => {
    expect(StatusCode.TooManyRequests).toBe(429);
  });

  test('has correct InternalServerError value', () => {
    expect(StatusCode.InternalServerError).toBe(500);
  });
});

// ============================================================================
// HttpError Tests
// ============================================================================

describe('HttpError', () => {
  test('creates error with all properties', () => {
    const error = new HttpError(
      500,
      'Server Error',
      'ERR_INTERNAL',
      'POST',
      '/api/data'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Server Error');
    expect(error.code).toBe('ERR_INTERNAL');
    expect(error.method).toBe('POST');
    expect(error.path).toBe('/api/data');
  });

  test('creates error with minimal properties', () => {
    const error = new HttpError(400);

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('');
    expect(error.code).toBeUndefined();
    expect(error.method).toBeUndefined();
    expect(error.path).toBeUndefined();
  });
});

describe('NotFoundError', () => {
  test('has 404 status code', () => {
    const error = new NotFoundError();
    expect(error.statusCode).toBe(404);
  });

  test('has default message', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Not Found');
  });

  test('accepts custom message', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.message).toBe('Resource not found');
  });

  test('is instance of HttpError', () => {
    const error = new NotFoundError();
    expect(error).toBeInstanceOf(HttpError);
  });
});

describe('BadRequestError', () => {
  test('has 400 status code', () => {
    const error = new BadRequestError();
    expect(error.statusCode).toBe(400);
  });

  test('has default message', () => {
    const error = new BadRequestError();
    expect(error.message).toBe('Bad Request');
  });

  test('accepts custom message and code', () => {
    const error = new BadRequestError('Invalid input', 'VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('UnauthorizedError', () => {
  test('has 401 status code', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
  });

  test('has default message', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Unauthorized');
  });
});

describe('TooManyRequestsError', () => {
  test('has 429 status code', () => {
    const error = new TooManyRequestsError();
    expect(error.statusCode).toBe(429);
  });

  test('has default message', () => {
    const error = new TooManyRequestsError();
    expect(error.message).toBe('TooManyRequests');
  });
});

// ============================================================================
// Query String Edge Cases
// ============================================================================

describe('Query String Edge Cases', () => {
  test('handles empty query string', async () => {
    const req = new Request('http://localhost:3000/api');
    const parsed = await parseRequest(req);

    expect(parsed.queryString).toBe(false);
    expect(Object.keys(parsed.query).length).toBe(0);
  });

  test('handles query with empty value', async () => {
    const req = new Request('http://localhost:3000/api?key=');
    const parsed = await parseRequest(req);

    expect(parsed.query.key).toBe('');
  });

  test('handles query with special characters', async () => {
    const req = new Request(
      'http://localhost:3000/api?name=John%20Doe&email=test%40example.com'
    );
    const parsed = await parseRequest(req);

    expect(parsed.query.name).toBe('John Doe');
    expect(parsed.query.email).toBe('test@example.com');
  });

  test('handles query with unicode characters', async () => {
    const req = new Request(
      'http://localhost:3000/api?text=%E4%B8%AD%E6%96%87'
    );
    const parsed = await parseRequest(req);

    expect(parsed.query.text).toBe('中文');
  });
});

// ============================================================================
// Body Parsing Edge Cases
// ============================================================================

describe('Body Parsing Edge Cases', () => {
  test('handles empty JSON body', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toEqual({});
  });

  test('handles JSON array body', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[1, 2, 3]',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toEqual([1, 2, 3]);
  });

  test('handles nested JSON body', async () => {
    const body = { user: { name: 'John', address: { city: 'NYC' } } };
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toEqual(body);
  });

  test('handles invalid JSON gracefully', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toBe('not valid json');
    expect(parsed.rawBody).toBe('not valid json');
  });

  test('handles HTML content type as raw', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body>Hello</body></html>',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toBe('<html><body>Hello</body></html>');
    expect(parsed.bodyParser).toBe('text');
  });

  test('handles XML content type as raw', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: '<root><item>value</item></root>',
    });
    const parsed = await parseRequest(req);

    expect(parsed.body).toBe('<root><item>value</item></root>');
    expect(parsed.bodyParser).toBe('raw');
  });
});

// ============================================================================
// Path Parameter Edge Cases
// ============================================================================

describe('Path Parameter Edge Cases', () => {
  test('handles numeric path parameters', () => {
    const result = matchPath('/items/:id', '/items/12345');
    expect(result.params.id).toBe('12345');
  });

  test('handles UUID path parameters', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = matchPath('/items/:id', `/items/${uuid}`);
    expect(result.params.id).toBe(uuid);
  });

  test('handles special characters in path parameters', () => {
    const result = matchPath('/files/:name', '/files/my-file_v2.txt');
    expect(result.params.name).toBe('my-file_v2.txt');
  });

  test('handles multiple consecutive parameters', () => {
    const result = matchPath('/:a/:b/:c', '/x/y/z');
    expect(result.params).toEqual({ a: 'x', b: 'y', c: 'z' });
  });

  test('handles mixed static and dynamic segments', () => {
    const result = matchPath(
      '/api/:version/users/:id/profile',
      '/api/v1/users/123/profile'
    );
    expect(result.matched).toBe(true);
    expect(result.params).toEqual({ version: 'v1', id: '123' });
  });

  test('does not match when static segment differs', () => {
    const result = matchPath('/api/:version/users', '/api/v1/posts');
    expect(result.matched).toBe(false);
  });
});

// ============================================================================
// Response Edge Cases
// ============================================================================

describe('Response Edge Cases', () => {
  test('handles number response', async () => {
    const result = toResponse(42);
    expect(result.status).toBe(200);
    expect(await result.json()).toBe(42);
  });

  test('handles boolean response', async () => {
    const result = toResponse(true);
    expect(result.status).toBe(200);
    expect(await result.json()).toBe(true);
  });

  test('handles empty string response', async () => {
    const result = toResponse('');
    expect(result.status).toBe(200);
    expect(result.headers.get('Content-Type')).toBe('text/plain');
    expect(await result.text()).toBe('');
  });

  test('handles empty array response', async () => {
    const result = toResponse([]);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual([]);
  });

  test('handles deeply nested object response', async () => {
    const data = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
          },
        },
      },
    };
    const result = toResponse(data);
    expect(await result.json()).toEqual(data);
  });

  test('handles Res object with only status', () => {
    const res = { status: 201 };
    const result = toResponse(res);
    expect(result.status).toBe(201);
  });

  test('handles Res object with only completed flag', () => {
    const res = { completed: true };
    const result = toResponse(res);
    expect(result.status).toBe(200);
  });
});

// ============================================================================
// Multipart Form Data Edge Cases
// ============================================================================

describe('Multipart Form Data Edge Cases', () => {
  test('handles form with only text fields', async () => {
    const formData = new FormData();
    formData.append('field1', 'value1');
    formData.append('field2', 'value2');

    const req = new Request('http://localhost:3000/api/form', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(parsed.body.field1).toBe('value1');
    expect(parsed.body.field2).toBe('value2');
    expect(parsed.files).toEqual([]);
  });

  test('handles form with only files', async () => {
    const formData = new FormData();
    formData.append(
      'file1',
      new Blob(['content1'], { type: 'text/plain' }),
      'file1.txt'
    );
    formData.append(
      'file2',
      new Blob(['content2'], { type: 'application/pdf' }),
      'doc.pdf'
    );

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(Object.keys(parsed.body).length).toBe(0);
    expect(parsed.files?.length).toBe(2);
    expect(parsed.files?.[0].type).toContain('text/plain');
    expect(parsed.files?.[1].type).toContain('application/pdf');
  });

  test('handles multiple values for same field name', async () => {
    const formData = new FormData();
    formData.append('tags', 'tag1');
    formData.append('tags', 'tag2');
    formData.append('tags', 'tag3');

    const req = new Request('http://localhost:3000/api/form', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(parsed.body.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  test('handles file with empty content', async () => {
    const formData = new FormData();
    formData.append('empty', new Blob([], { type: 'text/plain' }), 'empty.txt');

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const parsed = await parseRequest(req);

    expect(parsed.files?.length).toBe(1);
    expect(parsed.files?.[0].size).toBe(0);
  });
});

// ============================================================================
// HTTP Methods Tests
// ============================================================================

describe('HTTP Methods', () => {
  test('parses PUT request body', async () => {
    const req = new Request('http://localhost:3000/api/resource/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updated: true }),
    });
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('PUT');
    expect(parsed.body).toEqual({ updated: true });
  });

  test('parses PATCH request body', async () => {
    const req = new Request('http://localhost:3000/api/resource/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'updated' }),
    });
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('PATCH');
    expect(parsed.body).toEqual({ field: 'updated' });
  });

  test('parses DELETE request without body', async () => {
    const req = new Request('http://localhost:3000/api/resource/1', {
      method: 'DELETE',
    });
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('DELETE');
  });

  test('parses DELETE request with body', async () => {
    const req = new Request('http://localhost:3000/api/resource/1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'obsolete' }),
    });
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('DELETE');
    expect(parsed.body).toEqual({ reason: 'obsolete' });
  });

  test('parses OPTIONS request', async () => {
    const req = new Request('http://localhost:3000/api/resource', {
      method: 'OPTIONS',
    });
    const parsed = await parseRequest(req);

    expect(parsed.method).toBe('OPTIONS');
  });
});

// ============================================================================
// Header Edge Cases
// ============================================================================

describe('Header Edge Cases', () => {
  test('handles headers with multiple values', async () => {
    const req = new Request('http://localhost:3000/api', {
      headers: {
        Accept: 'application/json, text/plain',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const parsed = await parseRequest(req);

    expect(parsed.headers['accept']).toBe('application/json, text/plain');
    expect(parsed.headers['accept-language']).toBe('en-US,en;q=0.9');
  });

  test('handles custom headers with special characters', async () => {
    const req = new Request('http://localhost:3000/api', {
      headers: {
        'X-Request-ID': '123-456-789',
        'X-Trace-Id': 'trace_abc_123',
      },
    });
    const parsed = await parseRequest(req);

    expect(parsed.headers['x-request-id']).toBe('123-456-789');
    expect(parsed.headers['x-trace-id']).toBe('trace_abc_123');
  });

  test('handles empty header value', async () => {
    const req = new Request('http://localhost:3000/api', {
      headers: {
        'X-Empty': '',
      },
    });
    const parsed = await parseRequest(req);

    expect(parsed.headers['x-empty']).toBe('');
  });
});
