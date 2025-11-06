# CLAUDE.md - Untangled Web Platform Guide

## Project Overview

**Untangled Web** is a comprehensive TypeScript-based backend framework for building web applications in the Untangled Finance platform. It provides a decorator-based, IoC (Inversion of Control) container architecture with support for HTTP servers, databases, caching, queuing, pub-sub, storage, and scheduled jobs.

### Key Information

- **Language**: TypeScript 5.7.3
- **Runtime**: Bun (primary), Node.js compatible
- **Main Framework**: Express.js (HTTP server)
- **Architecture**: IoC container with decorator-based configuration
- **Module System**: CommonJS (compiled output)

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

**Express-based server** with routing, middleware, and filters:

```typescript
@Module({
  controllers: [MyController],
  providers: [MyService],
})
export class App extends Application {
  async main() {
    await this.start({
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

**Audit Trail Support** (`src/connectors/mongo/audit.ts`):

MongoDB models support automatic audit trails that track all changes (CREATE, UPDATE, DELETE) in separate audit collections:

```typescript
import { Model, AuditOperation } from 'untangled-web/connectors/mongo';

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

// Changes are tracked automatically
await user.save(); // Audit entry created
user.name = 'New Name';
await user.save(); // UPDATE audit entry with changes

// Query audit history
import {
  getAuditHistory,
  restoreFromAudit,
} from 'untangled-web/connectors/mongo';
const history = await getAuditHistory(userId, 'users', { limit: 100 });

// Restore to previous state
const restored = await restoreFromAudit(userId, User, new Date('2025-01-15'));
```

~~See `AUDIT.md` for complete documentation.~~

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

- `RedisQueue` - Basic Redis queue
- `ReliableRedisQueue` - Reliable Redis queue with acknowledgment

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

Or use global helpers:

```typescript
await emit({ data: 'hello' }, 'channel1');
await on((message, channel) => {}, 'channel1');
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

**Event Handlers**:

- `onStarted(handler)` - Task started
- `onCompleted(handler)` - Task completed successfully
- `onFailed(handler)` - Task failed with error
- `onRun(handler)` - Task finished (success or failure)

### Authentication & Authorization (`src/middlewares/auth/`)

**JWT-based auth with RBAC**:

```typescript
@Controller('/api')
export class MyController {
  @Get('/protected')
  @Auth('read:users') // Requires permission
  async protected(req: AuthReq) {
    const { id, email, roles } = req._auth;
    return { user: email };
  }

  @Get('/public')
  @Auth.AllowAnonymous() // Optional auth
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
await storage.download(bucketName, fileName);
```

### Logging (`src/core/logging/`)

**Pino-based structured logging**:

```typescript
const logger = createLogger('module-name');
logger.info('Message', { key: 'value' });
logger.error('Error occurred', error);

// Or in classes with @Log
@Log
export class MyClass {
  constructor(private readonly logger: Logger) {}

  method() {
    this.logger.debug('Debug message');
  }
}
```

**Console overrides**: All `console.log/info/error/debug/warn` use logger

### JWT (`src/core/jwt/`)

**Token management**:

```typescript
const jwt = $(Jwt);
const token = jwt.sign({ id: 1, email: 'user@test.com', roles: ['admin'] });
const payload = jwt.verify(token);
```

### Validation (`src/core/validation/`)

**Step-based execution ordering**:

```typescript
class MyClass {
  @Step(1) // Executes first
  setup() {}

  @Step(2) // Executes second
  process() {}
}
```

## Project Structure

```
src/
├── boot/              # Boot system and loaders
│   ├── loaders/       # Config, bean, and hooks loaders
│   └── decorators/    # Cache and proxy decorators
├── connectors/        # External service connectors
│   ├── caching/       # Redis cache
│   ├── mongo/         # MongoDB
│   ├── postgres/      # PostgreSQL (TypeORM)
│   ├── pubsub/        # Redis pub-sub
│   ├── queue/         # Redis queue
│   ├── storage/       # GCP, AWS S3
│   ├── notify/        # Slack notifications
│   ├── ethers/        # Ethereum (ethers.js)
│   ├── graph/         # GraphQL clients
│   └── untangled/     # Untangled API client
├── core/              # Core framework modules
│   ├── http/          # HTTP server, routing, context
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

## Common Patterns

### 1. Creating an Application

```typescript
import { boot } from 'untangled-web/boot';
import * as bootLoaders from 'untangled-web/boot/loaders';
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
    await this.start({
      host: Configs.app.host,
      port: Configs.app.port,
    });
  }
}

// Boot the application
boot(App);
```

### 2. Creating Controllers

```typescript
import { Controller, Get, Post, Req } from 'untangled-web/core/http';
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
import { Bean } from 'untangled-web/core/ioc';

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
import { Model } from 'untangled-web/connectors/mongo';
import { Schema } from 'mongoose';

const User = Model(
  'User',
  new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  })
);

// Use anywhere
const users = await User.find({ active: true });
const user = new User({ name: 'John', email: 'john@example.com' });
await user.save();
```

### 5. Creating Scheduled Jobs

```typescript
import { Job, Cron, Runner } from 'untangled-web/core/scheduling';
import { Queue } from 'untangled-web/core/queue';

@Job
export class CleanupJob extends Runner {
  @Cron('0 0 * * *')  // Daily at midnight
  async cleanup() {
    // Cleanup logic
  }

  @Cron('*/5 * * * *')  // Every 5 minutes
  async processQueue() {
    const message = await $(Queue).dequeue('my-queue');
    // Process message
  }
}

// Register in boot
@Boot(
  bootLoaders.bean({
    scheduler: {
      enabled: true,
      jobs: [CleanupJob]
    }
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

## Environment Variables

The framework uses extensive environment variable configuration. Key variables:

**Application**:

- `APP_NAME`, `APP_VERSION`, `APP_DESCRIPTION`
- `HOST`, `PORT` - Server binding
- `URL` - Application URL

**Database**:

- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` - MongoDB
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSERNAME`, `PGPASSWORD` - PostgreSQL
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` - Redis

**Authentication**:

- `JWT_PRIVATE_KEY`, `JWT_EXPIRY`

**Cache/Queue/PubSub**:

- `CACHE_ENABLED`, `CACHE_TYPE`
- `QUEUE_TYPE`, `REDIS_QUEUE_HOST`
- `PUBSUB_TYPE`, `REDIS_PUBSUB_HOST`

**Storage**:

- `STORAGE_PROVIDER` (gcp/s3)
- `STORAGE_BUCKET_NAME`
- `GCP_PROJECT_ID`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

**Other**:

- `ENV` - Environment profile
- `ACL_PATH`, `ACL_ENABLED` - RBAC config
- `SLACK_OAUTH_TOKEN`, `SLACK_CHANNEL_ID`

## Development Workflow

### Building

```bash
bun run build       # Compile TypeScript to dist/
bun run clean       # Remove dist/ folder
```

### Formatting

```bash
bun run format      # Format with Prettier
```

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

## Important Notes

### Known Issues (from TODO.md)

1. **Heavy Dependencies**: Package includes blockchain libraries (viem, ethers) that are heavy for backend
2. **Monolithic Structure**: Not yet split into separate packages (core + plugins)
3. **Express Dependency**: Uses Express; Hono is recommended for better performance
4. **Proxy Feature**: Not working properly at the moment
5. **Documentation**: Minimal documentation currently available

### Best Practices

1. **Use Decorators**: Leverage decorators for clean, declarative configuration
2. **Bean Lifecycle**: Implement `OnInit` and `OnStop` for proper resource management
3. **Global Access**: Use `$(ClassName)` for bean access in non-injected contexts
4. **Error Handling**: Throw `HttpError` subclasses in controllers for proper error responses
5. **Type Safety**: Always type request/response bodies for better IDE support
6. **Logging**: Use structured logging with context objects, not just strings
7. **Configuration**: Never hardcode - use `Configs` for all environment-specific values
8. **Async/Await**: All async operations should use async/await, not callbacks

### Testing Considerations

- The framework uses `reflect-metadata` for decorator metadata
- Bean lifecycle must be properly managed in tests
- Use `destroy()` to remove beans between tests
- HTTP context is stored in AsyncLocalStorage

## TypeScript Configuration

- **Target**: ES6
- **Module**: CommonJS
- **Decorators**: Enabled (experimental + emit metadata)
- **Strict**: Not enforced but recommended
- **Lib**: DOM, ESNext
- **Module Resolution**: Node

## Key Dependencies

**Runtime**:

- express - HTTP server
- mongoose - MongoDB ODM
- typeorm, pg - PostgreSQL
- redis - Redis client
- jsonwebtoken - JWT
- cron - Job scheduling
- pino - Logging

**Cloud/External**:

- @google-cloud/storage - GCP storage
- @aws-sdk/client-s3 - AWS S3
- @slack/web-api - Slack integration
- ethers, viem - Ethereum (consider removing)
- graphql-request - GraphQL clients

## Getting Help

- Check `examples/web-app/` for working examples
- Review type definitions in `src/types/`
- Examine connector implementations for integration patterns
- Boot loaders in `src/boot/loaders/` show initialization patterns

## License

MIT - See LICENSE file for details.
