# Untangled Web

A TypeScript-based backend framework for building web applications in the Untangled Finance platform.

## Features

- **Bun.serve HTTP Server** - High-performance embedded HTTP server powered by Bun
- **Decorator-Based Configuration** - IoC container with `@Module`, `@Controller`, `@Bean` decorators
- **Request Handling** - Full support for JSON, form-urlencoded, text, and multipart/form-data
- **File Uploads** - Built-in multipart parsing with `UploadedFile`, `FileReq<T>`, and `AuthFileReq<T>` types
- **Filters/Middleware** - Request interceptors for auth, logging, rate limiting, validation
- **CORS Support** - Built-in CORS handling with preflight support
- **Database Connectors** - MongoDB and PostgreSQL support
- **Caching & Queuing** - Redis-based caching and queue systems
- **Scheduled Jobs** - Cron-based job scheduling with `@Job` and `@Cron` decorators
- **JWT Authentication** - Built-in JWT support with RBAC via `@Auth` decorator

## Getting Started

The library has been published in the NPM registry as well as in GitHub Packages. To get started with Untangled Web, install it using Bun:

```sh
bun add untangled-web
```

### Quick Example

```typescript
import {
  Application,
  Module,
  Controller,
  Get,
  Post,
  Req,
  FileReq,
} from 'untangled-web';

@Controller('/api')
class ApiController {
  @Get('/hello')
  hello() {
    return { message: 'Hello, World!' };
  }

  @Post('/upload')
  upload(req: FileReq<{ name: string }>) {
    const files = req.files;
    return { uploaded: files.length, name: req.body.name };
  }
}

@Module({ controllers: [ApiController] })
class App extends Application {
  async main() {
    await this.start({ host: '0.0.0.0', port: 3000 });
  }
}

new App().main();
```

## Examples

You can take a look at the available [examples](/examples/) to explore framework features:

- **web-app** - Comprehensive example with HTTP endpoints, file uploads, CORS, and filters

## Runtime

- **Runtime**: Bun (required)
- This is a Bun-native platform

## Documentation

See [CLAUDE.md](/CLAUDE.md) for detailed framework documentation including:

- Architecture principles and IoC container
- HTTP decorators and routing
- Database connectors (MongoDB, PostgreSQL)
- Caching, queuing, and pub-sub
- Authentication and authorization
- File uploads and storage
- Scheduled jobs

## License

MIT
