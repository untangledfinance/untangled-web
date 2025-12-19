import fs from 'fs';
import { RedisOptions, RedisStore } from '../../connectors/caching';
import { RedisLock } from '../../connectors/locking';
import { Mongo } from '../../connectors/mongo';
import { SlackConnector } from '../../connectors/notify';
import { EntityType, Postgres } from '../../connectors/postgres';
import { RedisPublisher, RedisSubscriber } from '../../connectors/pubsub';
import { RedisQueue, ReliableRedisQueue } from '../../connectors/queue';
import {
  GoogleCloudStorageConnector,
  S3Connector,
} from '../../connectors/storage';
import { CacheStore, LocalCacheStore } from '../../core/caching';
import { asBean, isBean, shutdown } from '../../core/ioc';
import { Jwt } from '../../core/jwt';
import { Lock, SimpleLock } from '../../core/locking';
import { NotifyConnector } from '../../core/notify';
import { Publisher, Subscriber } from '../../core/pubsub';
import { Queue } from '../../core/queue';
import { RbacValidator } from '../../core/rbac';
import { Runner } from '../../core/scheduling';
import { StorageConnector } from '../../core/storage';
import { Configurations } from '../../types';
import { useConfigs } from './hooks';
import { UseBootLoader } from './types';

/**
 * Initializes MongoDB connections.
 */
async function initializeMongoDatabase(configs: Configurations) {
  const mongo = new (asBean<Mongo>(Mongo))({
    database: configs.db.mongo.name,
    host: configs.db.mongo.host,
    port: configs.db.mongo.port,
    username: configs.db.mongo.username,
    password: configs.db.mongo.password,
    authDatabase: configs.db.mongo.authDatabase,
    tls: configs.db.mongo.tls,
  });
  return mongo;
}

/**
 * Initializes PostgreSQL connections.
 */
async function initializePostgresDatabase(
  configs: Configurations,
  ...entities: EntityType[]
) {
  const postgres = new (asBean<Postgres>(Postgres))(
    {
      database: configs.db.postgres.name,
      host: configs.db.postgres.host,
      port: configs.db.postgres.port,
      username: configs.db.postgres.username,
      password: configs.db.postgres.password,
      tls: configs.db.postgres.tls,
      migrationRoot: configs.db.postgres.migrationRoot,
    },
    ...entities
  );
  return postgres;
}

/**
 * Initializes the {@link StorageConnector} bean.
 */
async function initializeStorageConnector(configs: Configurations) {
  const asStorageConnectorBean = (connectorClass: Class<StorageConnector>) =>
    asBean<StorageConnector>(connectorClass, StorageConnector.name);
  const provider = configs.storage.provider;
  switch (provider?.toLowerCase()) {
    case 'gcp': {
      return new (asStorageConnectorBean(GoogleCloudStorageConnector))(
        configs.gcp.projectId
      );
    }
    case 's3': {
      return new (asStorageConnectorBean(S3Connector))({
        region: configs.aws.region,
        accessKeyId: configs.aws.accessKeyId,
        secretAccessKey: configs.aws.secretAccessKey,
      });
    }
  }
}

/**
 * Configures global {@link Jwt}.
 */
async function configureJwt(configs: Configurations) {
  return new (asBean<Jwt>(Jwt))(configs.jwt.privateKey, configs.jwt.expiry);
}

/**
 * Initializes Role-based Access-Control settings.
 */
async function initializeRbac(configs: Configurations) {
  if (configs.acl.enabled && configs.acl.path) {
    const acl = JSON.parse(fs.readFileSync(configs.acl.path).toString());
    return new (asBean<RbacValidator>(RbacValidator))(acl, true);
  }
}

/**
 * Initializes the {@link CacheStore} bean.
 */
async function initializeCacheStore(configs: Configurations) {
  const cacheStore: CacheStore = (() => {
    switch (configs.cache.type?.toLowerCase()) {
      case 'redis':
        return new (asBean<CacheStore>(RedisStore, CacheStore.name))({
          host: configs.db.redis.host,
          port: configs.db.redis.port,
          username: configs.db.redis.username,
          password: configs.db.redis.password,
          database: configs.db.redis.database,
        } as RedisOptions);
      default:
        return new (asBean<CacheStore>(LocalCacheStore, CacheStore.name))();
    }
  })();
  configs.cache.enabled && cacheStore.enable();
  return cacheStore;
}

/**
 * Initializes the {@link Queue} bean.
 * @param reliable to use the reliable queue.
 */
async function initializeMessageQueue(
  configs: Configurations,
  reliable?: boolean
) {
  const queueConnector = (() => {
    switch (configs.queue.type?.toLowerCase()) {
      case 'redis':
        return new (asBean<Queue>(
          reliable ? ReliableRedisQueue : RedisQueue,
          Queue.name
        ))({
          host: configs.queue.redis.host,
          port: configs.queue.redis.port,
          username: configs.queue.redis.username,
          password: configs.queue.redis.password,
          database: configs.queue.redis.database,
        });
    }
  })();
  return queueConnector;
}

/**
 * Initializes the {@link Publisher} bean.
 */
async function initializePublisher(configs: Configurations) {
  const publisher = (() => {
    switch (configs.pubsub.type?.toLowerCase()) {
      case 'redis':
        return new (asBean<Publisher>(RedisPublisher, Publisher.name))({
          host: configs.pubsub.redis.host,
          port: configs.pubsub.redis.port,
          username: configs.pubsub.redis.username,
          password: configs.pubsub.redis.password,
          database: configs.pubsub.redis.database,
        });
    }
  })();
  return publisher;
}

/**
 * Initializes the {@link Subscriber} bean.
 */
async function initializeSubscriber(configs: Configurations) {
  const subscriber = (() => {
    switch (configs.pubsub.type?.toLowerCase()) {
      case 'redis':
        return new (asBean<Subscriber>(RedisSubscriber, Subscriber.name))({
          host: configs.pubsub.redis.host,
          port: configs.pubsub.redis.port,
          username: configs.pubsub.redis.username,
          password: configs.pubsub.redis.password,
          database: configs.pubsub.redis.database,
        });
    }
  })();
  return subscriber;
}

/**
 * Initializes the {@link Lock} bean.
 */
async function initializeLock(configs: Configurations) {
  const lock = (() => {
    switch (configs.lock?.type?.toLowerCase()) {
      case 'redis':
        return new (asBean<Lock>(RedisLock, Lock.name))({
          host: configs.lock.redis.host,
          port: configs.lock.redis.port,
          username: configs.lock.redis.username,
          password: configs.lock.redis.password,
          database: configs.lock.redis.database,
        });
      default:
        return new (asBean<Lock>(SimpleLock, Lock.name))();
    }
  })();
  return lock;
}

/**
 * Initializes the {@link NotifyConnector} bean using Slack.
 */
async function initializeSlackClient(configs: Configurations) {
  const oauthToken = configs.slack.token;
  const channelId = configs.slack.channelId;
  return new (asBean<NotifyConnector>(SlackConnector, NotifyConnector.name))(
    oauthToken,
    channelId
  );
}

/**
 * Starts scheduling given {@link Runner} types.
 * @param defaultEnabled `true` to force enabling the scheduler.
 * @param jobs the {@link Runner} type list.
 */
async function scheduleJobs(
  configs: Configurations & {
    /**
     * Handles errors when executing a given task of a job.
     * @param job name of the job.
     * @param task name of the task.
     * @param error the error.
     */
    onError?: (job: string, task: string, error?: Error) => Promise<void>;
  },
  defaultEnabled?: boolean,
  ...jobs: Class<Runner>[]
) {
  const runners = [] as Runner[];
  const enabled =
    (defaultEnabled !== false && configs.job.enabled) ||
    defaultEnabled === true;
  if (enabled) {
    for (const type of jobs) {
      const beanType = isBean(type) ? type : asBean<Runner>(type);
      runners.push(
        new beanType().onFailed((task, error) =>
          configs.onError?.(type.name, task, error)
        )
      );
    }
  }
  return runners;
}

/**
 * Enables removing all beans before the main process exits.
 * @param onExit the function executes before the shutdown.
 */
async function enableSafeExit(
  configs: Configurations,
  onExit?: (configs: Configurations) => Promise<void>
) {
  try {
    await onExit?.(configs);
  } finally {
    process.on('SIGINT', shutdown).on('SIGTERM', shutdown);
  }
}

/**
 * Initialization options.
 */
export type InitOptions = Partial<{
  /**
   * Initializes databases.
   */
  database: Partial<{
    /**
     * MongoDB.
     */
    mongo: boolean;
    /**
     * PostgreSQL.
     */
    postgres:
      | boolean
      | {
          /**
           * Accepted Postgres entities.
           */
          entities: EntityType[];
        };
  }>;
  /**
   * Storage.
   */
  storage: boolean;
  /**
   * JSON Web Token.
   */
  jwt: boolean;
  /**
   * Role-based Access Control.
   */
  rbac: boolean;
  /**
   * Caching.
   */
  cache: boolean;
  /**
   * Message queue.
   */
  queue: Partial<{
    /**
     * Enables reliable queue.
     */
    reliable: boolean;
    /**
     * Redis Queue.
     */
    redis: boolean;
  }>;
  /**
   * Pub-Sub.
   */
  pubsub: Partial<{
    /**
     * Redis Pub-Sub.
     */
    redis: boolean;
  }>;
  /**
   * Distributed locking.
   */
  lock: Partial<{
    /**
     * Redis Lock.
     */
    redis: boolean;
  }>;
  /**
   * Uses Slack client.
   */
  slack: boolean;
  /**
   * Scheduler.
   */
  scheduler: {
    /**
     * To start scheduling jobs or not (default: {@link Configurations.job.enabled}).
     */
    enabled?: boolean;
    /**
     * A list of {@link Runner}s for scheduling.
     */
    jobs: Class<Runner>[];
    /**
     * Handles errors when executing a given task of a job.
     * @param job name of the job.
     * @param task name of the task.
     * @param error the error.
     */
    onError?: (job: string, task: string, error?: Error) => Promise<void>;
  };
  /**
   * Removes all beans before the main process exits. If a function is passed,
   * it will execute before all bean removals.
   */
  safeExit?: boolean | ((configs: Configurations) => Promise<void>);
  /**
   * Initializes additional beans.
   * @param configs used configurations for the initializations.
   */
  new: <T extends Configurations>(configs: T) => Promise<void>;
}>;

export default ((init) => async () => {
  const configs = useConfigs();
  init.database?.mongo && (await initializeMongoDatabase(configs));
  if (init.database?.postgres) {
    const entities =
      typeof init.database.postgres === 'object'
        ? init.database.postgres.entities
        : [];
    await initializePostgresDatabase(configs, ...entities);
  }
  init.storage && (await initializeStorageConnector(configs));
  init.jwt && (await configureJwt(configs));
  init.rbac && (await initializeRbac(configs));
  init.cache && (await initializeCacheStore(configs));
  init.queue && (await initializeMessageQueue(configs, init.queue.reliable));
  init.pubsub &&
    (await Promise.all([
      initializePublisher(configs),
      initializeSubscriber(configs),
    ]));
  init.lock && (await initializeLock(configs));
  init.slack && (await initializeSlackClient(configs));
  init.scheduler &&
    (await scheduleJobs(
      {
        ...configs,
        onError: init.scheduler.onError,
      },
      init.scheduler.enabled,
      ...init.scheduler.jobs
    ));
  init.safeExit &&
    (await enableSafeExit(
      configs,
      typeof init.safeExit === 'function' ? init.safeExit : undefined
    ));
  init.new && (await init.new(configs));
}) as UseBootLoader<InitOptions>;
