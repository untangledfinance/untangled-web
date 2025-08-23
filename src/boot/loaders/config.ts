import os from 'os';
import { ConfigStore, loadEnvFromJson } from '../../core/config';
import { HttpMethod } from '../../core/http';
import { Context } from '../../core/context';
import { Configurations } from '../../types';
import { BootLoader } from './types';

function configStore() {
  return Context.for<ConfigStore>('Configs').getOrThrow();
}

function env(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value !== undefined) return value;
  }
}

function defaultConfigs(): Partial<Configurations> {
  return {
    system: {
      name: env('SYSTEM_NAME') || os.hostname(),
    },
    app: {
      registry: env('APP_REGISTRY') || '',
      url: env('URL', 'APP_URL', 'APP_LINK') || '',
      icon: env('ICON', 'APP_ICON') || '',
      name: env('NAME', 'APP_NAME') || 'Application',
      version: env('VERSION', 'APP_VERSION') || '',
      description: env('DESCRIPTION', 'APP_DESCRIPTION') || '',
      host: env('HOST', 'APP_HOST') || '0.0.0.0',
      port: parseInt(env('PORT', 'APP_PORT')) || 3000,
    },
    cors: {
      allowedHeaders: env('CORS_ALLOWED_HEADERS')?.split?.(','),
      allowedMethods: env('CORS_ALLOWED_METHODS')?.split?.(',') as HttpMethod[],
      allowedOrigins: env('CORS_ALLOWED_ORIGINS')?.split?.(','),
      maxAge: env('CORS_MAX_AGE'),
    },
    proxy: Object.entries(process.env).reduce((m, [k, v]) => {
      if (k.startsWith('PROXY_')) {
        m[k.replace(/^PROXY_/g, '').toUpperCase()] = v;
      }
      return m;
    }, {}),
    job: {
      enabled: env('JOB_ENABLED', 'JOB_EXECUTOR_ENABLED') === 'true',
    },
    jwt: {
      privateKey: env('JWT_PRIVATE_KEY'),
      expiry: parseInt(env('JWT_EXPIRY')),
    },
    acl: {
      path: env('ACL_PATH'),
      enabled: env('ACL_ENABLED') === 'true',
    },
    db: {
      mongo: {
        name: env('DATABASE_NAME'),
        host: env('DATABASE_HOST'),
        port: parseInt(env('DATABASE_PORT')),
        username: env('DATABASE_USERNAME'),
        password: env('DATABASE_PASSWORD'),
        tls: env('DATABASE_TLS') === 'true',
      },
      postgres: {
        name: env('PGDATABASE'),
        host: env('PGHOST'),
        port: parseInt(env('PGPORT')),
        username: env('PGUSERNAME'),
        password: env('PGPASSWORD'),
        tls: env('PGSSL') === 'true',
        migrationRoot: env('PGMIGRATIONS'),
      },
      redis: {
        host: env('REDIS_HOST'),
        port: parseInt(env('REDIS_PORT')) || 6379,
        username: env('REDIS_USERNAME'),
        password: env('REDIS_PASSWORD'),
        database: parseInt(env('REDIS_DATABASE')),
      },
    },
    cache: {
      enabled: env('CACHE_ENABLED') === 'true',
      type: env('CACHE_TYPE'),
    },
    queue: {
      type: env('QUEUE_TYPE'),
      redis: {
        host: env('REDIS_QUEUE_HOST'),
        port: parseInt(env('REDIS_QUEUE_PORT')) || 6379,
        username: env('REDIS_QUEUE_USERNAME'),
        password: env('REDIS_QUEUE_PASSWORD'),
        database: parseInt(env('REDIS_QUEUE_DATABASE')),
      },
    },
    pubsub: {
      type: env('PUBSUB_TYPE'),
      redis: {
        host: env('REDIS_PUBSUB_HOST'),
        port: parseInt(env('REDIS_PUBSUB_PORT')) || 6379,
        username: env('REDIS_PUBSUB_USERNAME'),
        password: env('REDIS_PUBSUB_PASSWORD'),
        database: parseInt(env('REDIS_PUBSUB_DATABASE')),
      },
    },
    storage: {
      provider: env('STORAGE_PROVIDER'),
      bucketName: env('STORAGE_BUCKET_NAME'),
    },
    slack: {
      token: env('SLACK_OAUTH_TOKEN'),
      channelId: env('SLACK_CHANNEL_ID', 'SLACK_DEFAULT_CHANNEL_ID'),
    },
    gcp: {
      projectId: env('GCP_PROJECT_ID'),
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
        env: /* reconstruct json values */ Object.entries(process.env).reduce(
          (env, [key, val]) => {
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
