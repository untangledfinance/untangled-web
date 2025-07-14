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
          host: configs.redis.host,
          port: configs.redis.port,
          username: configs.redis.username,
          password: configs.redis.password,
          database: configs.redis.database,
        } as RedisOptions);
      default:
        return new (asBean<CacheStore>(LocalCacheStore, CacheStore.name))();
    }
  })();
  configs.cache.enabled && cacheStore.enable();
  return cacheStore;
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
  init.new && (await init.new(configs));
}) as BootLoader<InitOptions>;
