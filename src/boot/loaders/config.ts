import { ConfigStore, loadEnvFromJson } from '../../core/config';
import { HttpMethod } from '../../core/http';
import { Context } from '../../core/context';
import { Configurations } from '../../types';
import { BootLoader } from './types';

function configStore() {
  return Context.for<ConfigStore>('Configs').getOrThrow();
}

function defaultConfigs(): Partial<Configurations> {
  return {
    app: {
      name: (process.env['NAME'] as string) || 'Application',
      version: (process.env['VERSION'] as string) || '',
      description: (process.env['DESCRIPTION'] as string) || '',
      host: (process.env['HOST'] as string) || '0.0.0.0',
      port: parseInt(process.env['PORT'] as string) || 3000,
    },
    cors: {
      allowedHeaders: process.env['CORS_ALLOWED_HEADERS']?.split?.(','),
      allowedMethods: process.env['CORS_ALLOWED_METHODS']?.split?.(
        ','
      ) as HttpMethod[],
      allowedOrigins: process.env['CORS_ALLOWED_ORIGINS']?.split?.(','),
      maxAge: process.env['CORS_MAX_AGE'],
    },
    proxy: Object.keys(process.env).reduce((m, k) => {
      if (k.startsWith('PROXY_')) {
        m[k.replace(/^PROXY_/g, '').toUpperCase()] = process.env[k];
      }
      return m;
    }, {}),
    job: {
      enabled: (process.env['JOB_EXECUTOR_ENABLED'] as string) === 'true',
    },
    jwt: {
      privateKey: process.env['JWT_PRIVATE_KEY'],
      expiry: parseInt(process.env['JWT_EXPIRY'] as string),
    },
    acl: {
      path: process.env['ACL_PATH'],
      enabled: (process.env['ACL_ENABLED'] as string) === 'true',
    },
    db: {
      mongo: {
        name: process.env['DATABASE_NAME'],
        host: process.env['DATABASE_HOST'],
        port: parseInt(process.env['DATABASE_PORT'] as string),
        username: process.env['DATABASE_USERNAME'],
        password: process.env['DATABASE_PASSWORD'],
        tls: process.env['DATABASE_TLS'] === 'true',
      },
      postgres: {
        name: process.env['PGDATABASE'],
        host: process.env['PGHOST'],
        port: parseInt(process.env['PGPORT'] as string),
        username: process.env['PGUSERNAME'],
        password: process.env['PGPASSWORD'],
        tls: process.env['PGSSL'] === 'true',
        migrationRoot: process.env['PGMIGRATIONS'],
      },
      redis: {
        host: process.env['REDIS_HOST'],
        port: parseInt(process.env['REDIS_PORT'] ?? '6379'),
        username: process.env['REDIS_USERNAME'],
        password: process.env['REDIS_PASSWORD'],
        database: parseInt(process.env['REDIS_DATABASE'] as string),
      },
    },
    cache: {
      enabled: (process.env['CACHE_ENABLED'] as string) === 'true',
      type: process.env['CACHE_TYPE'],
    },
    queue: {
      type: process.env['QUEUE_TYPE'],
      redis: {
        host: process.env['REDIS_QUEUE_HOST'],
        port: parseInt(process.env['REDIS_QUEUE_PORT'] ?? '6379'),
        username: process.env['REDIS_QUEUE_USERNAME'],
        password: process.env['REDIS_QUEUE_PASSWORD'],
        database: parseInt(process.env['REDIS_QUEUE_DATABASE'] as string),
      },
    },
    storage: {
      provider: process.env['STORAGE_PROVIDER'],
      bucketName: process.env['STORAGE_BUCKET_NAME'],
    },
    slack: {
      token: process.env['SLACK_OAUTH_TOKEN'],
      channelId: process.env['SLACK_DEFAULT_CHANNEL_ID'],
    },
    gcp: {
      projectId: process.env['GCP_PROJECT_ID'],
    },
  };
}

export type ConfigOptions = Partial<{
  overrideConfigs:
    | Partial<Configurations>
    | (() => Partial<Configurations>)
    | (() => Promise<Partial<Configurations>>);
  externalConfigFiles: string[];
}>;

export default (({
    overrideConfigs = {},
    externalConfigFiles: externalConfigPaths = [],
  } = {}) =>
  async () => {
    externalConfigPaths.forEach(loadEnvFromJson);
    const newConfigs =
      overrideConfigs instanceof Function ? overrideConfigs() : overrideConfigs;
    configStore()
      .load({
        ...defaultConfigs(),
        env: /* reconstruct json values */ Object.keys(process.env).reduce(
          (env, key) => {
            const val = process.env[key];
            try {
              env[key] = JSON.parse(val);
            } catch {
              env[key] = val;
            }
            return env;
          },
          {}
        ),
      } as Configurations)
      .load(newConfigs instanceof Promise ? await newConfigs : newConfigs);
  }) as BootLoader<ConfigOptions>;
