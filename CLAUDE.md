# CLAUDE.md - Untangled Web Platform Guide

## Project Overview

**Untangled Web** is a comprehensive TypeScript-based backend framework for building web applications in the Untangled Finance platform. It provides a decorator-based, IoC (Inversion of Control) container architecture with support for HTTP servers, databases, caching, queuing, pub-sub, storage, and scheduled jobs.

### Key Information

- **Language**: TypeScript 5.9+
- **Runtime**: Bun (native, required)
- **Main Framework**: Bun.serve (HTTP server)
- **Architecture**: IoC container with decorator-based configuration
- **Module System**: CommonJS (compiled output)
- **Package Manager**: Bun

## Architecture Principles

### 1. Inversion of Control (IoC) Container

The framework uses a sophisticated IoC container (`src/core/ioc/index.ts`) that manages bean lifecycle:

- **Bean Registration**: Classes decorated with `@Bean` or `@Auto` are automatically registered
- **Singleton Pattern**: All beans are singletons by default via `asSingleton()`
- **Lifecycle Hooks**:
  - `@BeforeInit` - Executes before bean initialization (no `this` binding)
  - `@AfterInit` / `onInit()` - Executes after initialization
  - `@PreDestroy` / `onStop()` - Executes before bean destruction
- **Bean Retrieval**: Use `beanOf(ClassName)` or global `$(ClassName)` to get instances

### 2. Global Utilities (`src/global.ts`)

The framework extends the global scope with utilities:

```typescript
globalThis.Configs; // Global configuration access
globalThis.Singleton; // Create singleton classes
globalThis.Bean; // Create bean classes
globalThis.Auto; // Auto-initialize beans
globalThis.$; // Shorthand for beanOf()
globalThis.log(); // Unified logging
globalThis.emit(); // Event publishing
globalThis.on(); // Event subscription
```

### 3. Decorator-Based Configuration

The framework heavily uses TypeScript decorators for declarative configuration:

#### HTTP Decorators:

- `@Module({ controllers, providers, imports })` - Define application modules
- `@Controller(basePath?)` - Mark classes as HTTP controllers
- `@Get(path)`, `@Post(path)`, `@Put(path)`, `@Delete(path)`, `@Patch(path)` - HTTP method handlers
- `@Request(path)` - Handler for all HTTP methods
- `@Auth(...permissions)` - JWT authentication with RBAC
- `@Profile(name)` / `@Env(name)` - Environment-specific components

#### Boot Decorators:

- `@Boot(...loaders)` - Attach boot loaders to application class
- Boot loaders execute before bean initialization

#### Scheduling Decorators:

- `@Job` - Mark class as scheduled job runner
- `@Cron(expression)` - Schedule method execution with cron syntax
- `@Once` - Run job only once

#### Logging:

- `@Log` - Auto-inject Logger instance into class

## Core Modules

### HTTP Server (`src/core/http/`)

**Bun-based server** with routing, middleware, and filters.

**Server Implementation**: `src/core/http/server/bun.ts`

**Key Classes**:

- `Helper` - Utility class for request/response processing, CORS, path matching
- `Group` - Abstract base for route grouping and middleware management
- `Application` - Main HTTP server class extending Group

**Key Features**:

- Lazy body parsing (body parsed only when `getBody()` is called or handler accesses it)
- Streaming request support via `StreamReq` for proxy/large uploads
- Full request parsing (JSON, urlencoded, text, raw, multipart/form-data)
- File upload support with `UploadedFile` type
- Streaming proxy support with `proxyTo()` directive
- Native `Response` object passthrough
- Built-in CORS handling
- Path parameter extraction (e.g., `/users/:id` → `req.params.id`)
- Event emission (`request`, `response`, `started`, `stopped`, `crashed`)

```typescript
@Module({
  controllers: [MyController],
  providers: [MyService],
})
export class App extends Application {
  async main() {
    this.cors('*')
      .on('started', (data) => console.log('Started', data))
      .on('response', (req, res) =>
        console.log(req.method, req.path, res.status)
      )
      .use('/api', ApiModule)
      .start({
        host: Configs.app.host,
        port: Configs.app.port,
      });
  }
}
```

**Key Concepts**:

- **Filters**: Middleware-like functions that intercept requests
- **Request/Response**: `Req<T>` and `Res<T>` abstractions
- **Context**: `HttpContext` stores current request context
- **Error Handling**: `HttpError` subclasses (NotFoundError, UnauthorizedError, etc.)
- **CORS**: Built-in CORS support with `cors()` method

**Request Types** (in `src/core/http/core.ts`):

```typescript
// Standard request - body is auto-parsed before handler runs (unless streaming)
type Req<T> = {
  method: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
  queryString?: string;
  params?: Record<string, string>;
  body?: T; // Populated after getBody() is called
  rawBody?: string;
  files?: UploadedFile[];
  getBody?: () => Promise<T>; // Explicit lazy parsing
  getRawBody?: () => Promise<string | undefined>;
  getFiles?: () => Promise<UploadedFile[] | undefined>;
  rawRequest?: Request; // Original request for streaming proxy
};

// Streaming request - use `await req.body` for Promise-based parsing
type StreamReq<T> = {
  method: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
  queryString?: string;
  params?: Record<string, string>;
  body: Promise<T | undefined>; // Promise-based
  rawBody: Promise<string | undefined>; // Promise-based
  files: Promise<UploadedFile[] | undefined>; // Promise-based
  rawRequest?: Request;
};

// Represents an uploaded file
interface UploadedFile {
  name: string; // Form field name
  filename: string; // Original filename
  type: string; // MIME type
  size: number; // File size in bytes
  data: Blob; // File content as Blob
}

// Request with file uploads
type FileReq<T> = Req<T> & { files: UploadedFile[] };
```

**Body Parsing Modes**:

```typescript
// 1. Default: Auto-parsed for non-streaming routes
@Post('/users')
async createUser(req: Req<CreateUserDto>) {
  const { name, email } = req.body;  // Already parsed
  return { created: { name, email } };
}

// 2. Streaming: Use await req.body (for proxy/streaming handlers)
@Post('/upload', { streaming: true })
async handleUpload(req: StreamReq) {
  const body = await req.body;   // Parsed on demand
  const files = await req.files; // Parsed on demand
  return { received: body };
}

// 3. Group-based streaming route
this.post('/stream', async (req: StreamReq) => {
  const body = await req.body;
  return { data: body };
}, { streaming: true });
```

**Streaming Proxy**:

```typescript
import { proxyTo } from 'untangled-web/core/http';

// Return proxyTo() directive to stream request to target
@Post('/proxy', { streaming: true })
async proxyRequest(req: StreamReq) {
  // Body is NOT parsed - streams directly to target
  return proxyTo('https://api.example.com/endpoint');
}
```

**Authenticated File Upload Type** (in `src/middlewares/auth/index.ts`):

```typescript
// Combines authentication and file upload
type AuthFileReq<T> = FileReq<T> & {
  _auth: { id: number; email: string; roles: string[]; perms: string[] };
};
```

**Controller Return Rules**:

- Return raw JS data (object/array/string) for automatic JSON serialization
- Return native `Response` object for custom status/headers/body
- Return `proxyTo()` directive for streaming proxy

### Boot System (`src/boot/`)

**Initialization framework** with composable loaders:

```typescript
@Boot(
  bootLoaders.config(), // Load configurations
  bootLoaders.bean({
    // Initialize beans
    database: { mongo: true },
    cache: true,
    jwt: true,
    scheduler: { enabled: true, jobs: [MyJob] },
  })
)
export class App extends Application {}
```

**Available Loaders**:

- `config()` - Load environment variables and config files
- `bean()` - Initialize databases, caches, queues, JWT, schedulers, etc.

### Configuration System (`src/core/config/`, `src/types/config.ts`)

**Hierarchical configuration** from environment variables:

- **Environment Variables**: Loaded from `process.env`
- **Config Structure**: `Configurations` type defines all possible configs
- **Access**: Via `Configs` global or `useConfigs()` hook
- **Override**: Use `overrideConfigs` in boot loader

**Key Config Sections**:

- `app` - Application settings (name, host, port, URL)
- `db` - Database connections (mongo, postgres, redis)
- `cache` - Caching configuration
- `queue` - Message queue settings
- `pubsub` - Pub-Sub configuration
- `storage` - Cloud storage (GCP, AWS S3)
- `jwt` - JWT authentication
- `acl` - RBAC settings
- `cors` - CORS configuration
- `env` - Custom environment variables (auto-parsed as JSON if valid)

### Database Connectors

#### MongoDB (`src/connectors/mongo/`)

```typescript
// Bean-managed connection
const mongo = $(Mongo);

// Define models
const User = Model(
  'User',
  new Schema({
    name: String,
    email: String,
  })
);

// Use models
const users = await User.find({ active: true });
```

**REST API Support** (`src/connectors/mongo/http.ts`):

```typescript
import { useMongoREST } from 'untangled-web/connectors/mongo';

const { MongoModule } = useMongoREST({
  dbName: ['mydb'],
  auth: { allowAnonymous: false },
});

// Mount at /_data for REST access to collections
app.use('/_data', MongoModule);
// GET /_data/users - List users
// GET /_data/users/:id - Get user by ID
```

**Audit Trail Support** (`src/connectors/mongo/audit.ts`):

MongoDB models support automatic audit trails that track all changes:

```typescript
const User = Model('User', UserSchema, 'users', {
  audit: {
    enabled: true,
    excludeFields: ['password'],
    operations: [
      AuditOperation.CREATE,
      AuditOperation.UPDATE,
      AuditOperation.DELETE,
    ],
    getActor: async () => {
      const { req } = HttpContext.get() || {};
      return req?._auth
        ? { id: req._auth.id, email: req._auth.email }
        : { type: 'system' };
    },
    maxEntries: 1000,
    retentionDays: 365,
  },
});
```

#### PostgreSQL (`src/connectors/postgres/`)

Uses TypeORM for entity management:

```typescript
const postgres = $(Postgres);
const repository = postgres.repo(UserEntity);
await repository.find();
```

### Caching (`src/core/caching/`)

**Pluggable cache stores**:

- `LocalCacheStore` - In-memory caching
- `RedisStore` - Redis-based caching

```typescript
const cache = $(CacheStore);
await cache.set('key', 'value', 60000); // 60s TTL
const value = await cache.get('key');
```

### Queue System (`src/core/queue/`)

**Message queue abstraction**:

```typescript
const queue = $(Queue);
await queue.enqueue('queueId', message);
const msg = await queue.dequeue('queueId');
```

### Pub-Sub (`src/core/pubsub/`)

**Publish-Subscribe pattern**:

```typescript
const publisher = $(Publisher);
const subscriber = $(Subscriber);

await subscriber.subscribe(
  async (message, channel) => {
    console.log(`Received on ${channel}:`, message);
  },
  'channel1',
  'channel2'
);

await publisher.publish({ data: 'hello' }, 'channel1');
```

### Scheduling (`src/core/scheduling/`)

**Cron-based job scheduling**:

```typescript
@Job
export class MyJob extends Runner {
  @Cron('*/5 * * * * *') // Every 5 seconds
  async task() {
    console.log('Task executed');
  }
}
```

### Authentication & Authorization (`src/middlewares/auth/`)

**JWT-based auth with RBAC**:

```typescript
@Controller('/api')
export class MyController {
  @Get('/protected')
  @Auth('read:users')
  async protected(req: AuthReq) {
    const { id, email, roles } = req._auth;
    return { user: email };
  }

  @Get('/public')
  @Auth.AllowAnonymous()
  async public(req: AuthReq) {
    // Works with or without token
  }
}
```

### Storage (`src/core/storage/`, `src/connectors/storage/`)

**Cloud storage abstraction**:

- `GoogleCloudStorageConnector` - Google Cloud Storage
- `S3Connector` - AWS S3

```typescript
const storage = $(StorageConnector);
await storage.upload(bucketName, fileName, buffer);
const url = await storage.getSignedUrl(bucketName, fileName);
```

### Logging (`src/core/logging/`)

**Pino-based structured logging**:

```typescript
const logger = createLogger('module-name');
logger.info('Message', { key: 'value' });
logger.error('Error occurred', error);

// Or in classes with @Log decorator
@Log
export class MyClass {
  readonly logger: Logger;

  method() {
    this.logger.debug('Debug message');
  }
}
```

### JWT (`src/core/jwt/`)

**Token management**:

```typescript
const jwt = $(Jwt);
const token = jwt.sign({ id: 1, email: 'user@test.com', roles: ['admin'] });
const payload = jwt.verify(token);
```

## Project Structure

```
src/
├── boot/              # Boot system and loaders
│   ├── _dev/          # Development controllers (health, admin, etc.)
│   ├── loaders/       # Config, bean, and hooks loaders
│   ├── decorators/    # Cache and proxy decorators
│   └── utils/         # Boot utilities (slack, http helpers)
├── connectors/        # External service connectors
│   ├── caching/       # Redis cache
│   ├── mongo/         # MongoDB (client, http REST, audit)
│   ├── postgres/      # PostgreSQL (TypeORM)
│   ├── pubsub/        # Redis pub-sub
│   ├── queue/         # Redis queue
│   ├── storage/       # GCP, AWS S3
│   ├── notify/        # Slack notifications
│   ├── ethers/        # Ethereum (ethers.js)
│   ├── graph/         # GraphQL clients
│   └── untangled/     # Untangled API client
├── core/              # Core framework modules
│   ├── http/          # HTTP server, routing, context, proxy
│   │   ├── server/    # Bun server implementation
│   │   ├── client/    # HTTP client
│   │   └── ...        # Core types, errors, context
│   ├── ioc/           # IoC container
│   ├── config/        # Configuration management
│   ├── logging/       # Logging utilities
│   ├── caching/       # Cache abstraction
│   ├── queue/         # Queue abstraction
│   ├── pubsub/        # Pub-sub abstraction
│   ├── scheduling/    # Job scheduling
│   ├── storage/       # Storage abstraction
│   ├── jwt/           # JWT utilities
│   ├── rbac/          # RBAC validation
│   ├── event/         # Event emitter
│   ├── encoding/      # Encoding utilities
│   ├── context/       # Async context storage
│   ├── tunneling/     # SSH tunneling
│   ├── notify/        # Notification abstraction
│   ├── types/         # Type utilities
│   └── validation/    # Validation decorators
├── middlewares/       # HTTP middlewares
│   ├── auth/          # Authentication
│   ├── cache/         # Response caching
│   └── rate-limit/    # Rate limiting
├── types/             # Global type definitions
├── global.ts          # Global scope extensions
└── index.ts           # Main export
```

## Development Workflow

### Building

```bash
bun run build       # Compile TypeScript to dist/
bun run clean       # Remove dist/ folder
```

### Formatting & Linting

```bash
bun run format      # Lint (remove unused imports) + format with Prettier
bun run format:check # Check formatting without modifying
bun run lint        # Run ESLint with auto-fix
bun run lint:check  # Run ESLint without auto-fix
```

**Tooling**:

- **ESLint** with `eslint-plugin-unused-imports` - Automatically removes unused imports
- **Prettier** with `@trivago/prettier-plugin-sort-imports` - Formats code and organizes imports

**Import Order** (configured in `.prettierrc`):

1. Node built-ins (`node:*`)
2. Third-party modules
3. Local imports (`./`, `../`)

### Publishing

```bash
bun run bump        # Bump version
```

### Running Examples

```bash
cd examples/web-app
bun install
bun run dev         # Start development server
```

## Environment Variables

The framework uses extensive environment variable configuration. Key variables:

**Application**:

- `APP_NAME`, `APP_VERSION`, `APP_DESCRIPTION`
- `HOST`, `PORT` - Server binding
- `URL` - Application URL
- `ENV` - Environment name (dev, prod, etc.)
- `PROFILES` - Comma-separated profile names

**Database**:

- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` - MongoDB
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSERNAME`, `PGPASSWORD` - PostgreSQL
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DATABASE` - Redis

**Authentication**:

- `JWT_PRIVATE_KEY`, `JWT_EXPIRY`
- `ACL_PATH`, `ACL_ENABLED` - RBAC config

**Cache/Queue/PubSub**:

- `CACHE_ENABLED`, `CACHE_TYPE`
- `QUEUE_TYPE`, `REDIS_QUEUE_HOST`, `REDIS_QUEUE_DATABASE`
- `PUBSUB_TYPE`, `REDIS_PUBSUB_HOST`, `REDIS_PUBSUB_DATABASE`

**Storage**:

- `STORAGE_PROVIDER` (gcp/s3)
- `STORAGE_BUCKET_NAME`
- `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

**Other**:

- `SLACK_OAUTH_TOKEN`, `SLACK_CHANNEL_ID`
- `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_METHODS`, `CORS_ALLOWED_HEADERS`

## Common Patterns

### 1. Creating an Application

```typescript
import { boot } from 'untangled-web/boot';
import bootLoaders from 'untangled-web/boot/loaders';
import { Application, Module } from 'untangled-web/core/http';

@Boot(
  bootLoaders.config(),
  bootLoaders.bean({
    database: { mongo: true },
    cache: true,
    jwt: true,
  })
)
@Module({
  controllers: [MyController],
})
export class App extends Application {
  async main() {
    this.cors('*')
      .on('response', (req, res) =>
        console.log(req.method, req.path, res.status)
      )
      .start({
        host: Configs.app.host,
        port: Configs.app.port,
      });
  }
}

boot(App);
```

### 2. Creating Controllers

```typescript
import { Controller, Get, Post } from 'untangled-web/core/http';
import { Auth, AuthReq } from 'untangled-web/middlewares/auth';

@Controller('/api/users')
export class UserController {
  @Get('/')
  @Auth('read:users')
  async list(req: AuthReq) {
    return { users: [] };
  }

  @Post('/')
  @Auth('write:users')
  async create(req: AuthReq<CreateUserDto>) {
    const userData = req.body;
    return { created: true };
  }
}
```

### 3. Creating Services (Beans)

```typescript
import { Bean, beanOf } from 'untangled-web/core/ioc';

@Bean
export class UserService {
  async findAll() {
    // Logic here
  }
}

// Use in controllers
@Controller()
export class MyController {
  constructor(private userService = $(UserService)) {}
}
```

### 4. Working with MongoDB

```typescript
import { Schema } from 'mongoose';
import { Model } from 'untangled-web/connectors/mongo';

const User = Model(
  'User',
  new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  })
);

const users = await User.find({ active: true });
const user = new User({ name: 'John', email: 'john@example.com' });
await user.save();
```

### 5. Creating Scheduled Jobs

```typescript
import { Job, Cron, Runner } from 'untangled-web/core/scheduling';

@Job
export class CleanupJob extends Runner {
  @Cron('0 0 * * *') // Daily at midnight
  async cleanup() {
    // Cleanup logic
  }
}

// Register in boot
@Boot(
  bootLoaders.bean({
    scheduler: {
      enabled: true,
      jobs: [CleanupJob],
    },
  })
)
```

### 6. Using Filters (Middleware)

```typescript
import { Filter } from 'untangled-web/core/http';

const loggingFilter: Filter = async (req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  return next(req, res);
};

@Module({ controllers: [] })
export class App extends Application {
  constructor() {
    super();
    this.guard(loggingFilter); // Apply globally
  }
}
```

### 7. Streaming Proxy

```typescript
import { proxyTo } from 'untangled-web/core/http';

@Controller('/proxy')
export class ProxyController {
  @Post('/forward', { streaming: true })
  async forward(req: StreamReq) {
    // Stream request body directly to target without parsing
    return proxyTo('https://api.example.com/endpoint', {
      forwardHeaders: true,
      forwardQuery: true,
    });
  }
}
```

## Best Practices

1. **Use Decorators**: Leverage decorators for clean, declarative configuration
2. **Bean Lifecycle**: Implement `OnInit` and `OnStop` for proper resource management
3. **Global Access**: Use `$(ClassName)` for bean access in non-injected contexts
4. **Error Handling**: Throw `HttpError` subclasses in controllers for proper error responses
5. **Type Safety**: Always type request/response bodies for better IDE support
6. **Logging**: Use structured logging with context objects, not just strings
7. **Configuration**: Never hardcode - use `Configs` for all environment-specific values
8. **Async/Await**: All async operations should use async/await, not callbacks
9. **Streaming**: Use `{ streaming: true }` for proxy routes to avoid body consumption

## TypeScript Configuration

- **Target**: ES2022
- **Module**: CommonJS
- **Decorators**: Enabled (experimental + emit metadata)
- **Lib**: DOM, ESNext
- **Module Resolution**: Node

## Key Dependencies

**Runtime**:

- bun - HTTP server (Bun.serve)
- mongoose - MongoDB ODM
- typeorm, pg - PostgreSQL
- redis - Redis client
- jsonwebtoken - JWT
- cron - Job scheduling
- pino - Logging
- qs - Query string parsing

**Cloud/External**:

- @google-cloud/storage - GCP storage
- @aws-sdk/client-s3 - AWS S3
- @slack/web-api - Slack integration
- ethers, viem - Ethereum
- graphql-request - GraphQL clients
- axios - HTTP client

**Dev**:

- typescript - TypeScript compiler
- prettier - Code formatting
- @trivago/prettier-plugin-sort-imports - Import sorting
- eslint - Linting
- eslint-plugin-unused-imports - Remove unused imports

## Getting Help

- Check `examples/web-app/` for working examples
- Review type definitions in `src/types/`
- Examine connector implementations for integration patterns
- Boot loaders in `src/boot/loaders/` show initialization patterns
- HTTP server implementation in `src/core/http/server/bun.ts`

## License

MIT - See LICENSE file for details.
