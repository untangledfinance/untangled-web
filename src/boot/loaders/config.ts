import os from 'os';
import { ConfigStore, loadEnvFromJson } from '../../core/config';
import { HttpMethod } from '../../core/http';
import { Configurations, Env } from '../../types';
import { useConfigs } from './hooks';
import { UseBootLoader } from './types';

/**
 * {@link Env} from `process.env`.
 */
function processEnv(): Env {
  return process.env;
}

/**
 * Retrieves the first defined value from the current {@link Env}.
 * @param names {@link Env} keys to check.
 */
function env(...names: string[]) {
  const environ = processEnv();
  for (const name of names) {
    if (!name?.trim()?.length) continue;
    const value = environ[name];
    if (value !== undefined) return value;
  }
}

/**
 * Constructs the {@link Configurations} from current {@link Env}.
 */
function envConfigs(): Partial<Configurations> {
  const environ = processEnv();
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
    proxy: Object.entries(environ).reduce((m, [k, v]) => {
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
        authDatabase: env('DATABASE_AUTH_NAME'),
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
    lock: {
      type: env('LOCK_TYPE'),
      redis: {
        host: env('REDIS_LOCK_HOST'),
        port: parseInt(env('REDIS_LOCK_PORT')) || 6379,
        username: env('REDIS_LOCK_USERNAME'),
        password: env('REDIS_LOCK_PASSWORD'),
        database: parseInt(env('REDIS_LOCK_DATABASE')),
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
    aws: {
      region: env('AWS_REGION'),
      accessKeyId: env('AWS_ACCESS_KEY_ID'),
      secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
    },
    env: /* reconstruct json values */ Object.entries(environ).reduce(
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
  };
}

/**
 * Configuration options.
 */
export type ConfigOptions = Partial<{
  /**
   * Overrides the default configurations (partially).
   */
  overrideConfigs:
    | Partial<Configurations>
    | ((configs: Configurations) => Partial<Configurations>)
    | ((configs: Configurations) => Promise<Partial<Configurations>>);
  /**
   * External JSON files to load configurations from.
   */
  externalConfigFiles: string[];
}>;

export default (({
    overrideConfigs = {},
    externalConfigFiles: externalConfigPaths = [],
  } = {}) =>
  async () => {
    externalConfigPaths.forEach(loadEnvFromJson);
    const configs = useConfigs<Env, Configurations>();
    const configStore = useConfigs<Env, ConfigStore>();
    const appConfigs =
      overrideConfigs instanceof Function
        ? overrideConfigs(configs)
        : overrideConfigs;
    configStore
      .load(envConfigs())
      .load(appConfigs instanceof Promise ? await appConfigs : appConfigs);
  }) as UseBootLoader<ConfigOptions>;
