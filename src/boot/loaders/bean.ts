import fs from 'fs';
import { Mongo } from '../../connectors/mongo';
import { EntityType, Postgres } from '../../connectors/postgres';
import { GoogleCloudStorageConnector } from '../../connectors/storage';
import { asBean } from '../../core/ioc';
import { Jwt } from '../../core/jwt';
import { StorageConnector } from '../../core/storage';
import { RbacValidator } from '../../core/rbac';
import { CacheStore, LocalCacheStore } from '../../core/caching';
import { RedisOptions, RedisStore } from '../../connectors/caching';
import { Context } from '../../core/context';
import { BootLoader } from './types';
import { Configurations } from '../../types';
import { Queue } from '../../core/queue';
import { RedisQueue, ReliableRedisQueue } from '../../connectors/queue';
import { Publisher, Subscriber } from '../../core/pubsub';
import { RedisPublisher, RedisSubscriber } from '../../connectors/pubsub';

function getConfigs() {
  return Context.for<Configurations>('Configs').getOrThrow();
}

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
 * Initializes the default {@link StorageConnector}.
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
 * Initializes {@link CacheStore} bean.
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

async function initializeMessageQueue(
  configs: Configurations,
  reliable?: boolean
) {
  const queueConnector = (() => {
    switch (configs.queue.type?.toLocaleLowerCase()) {
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

async function initializePublisher(configs: Configurations) {
  const publisher = (() => {
    switch (configs.pubsub.type?.toLocaleLowerCase()) {
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

async function initializeSubscriber(configs: Configurations) {
  const subscriber = (() => {
    switch (configs.pubsub.type?.toLocaleLowerCase()) {
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
   * Initializes additional beans.
   * @param configs used configurations for the initializations.
   */
  new: <T extends Configurations>(configs: T) => Promise<void>;
}>;

export default ((init) => async () => {
  const configs = getConfigs();
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
  init.new && (await init.new(configs));
}) as BootLoader<InitOptions>;
