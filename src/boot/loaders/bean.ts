import fs from 'fs';
import { Mongo, PollingOptions, poll } from '../../connectors/mongo';
import { GoogleCloudStorageConnector } from '../../connectors/storage';
import { asBean } from '../../core/ioc';
import { Jwt } from '../../core/jwt';
import { StorageConnector } from '../../core/storage';
import { RbacValidator } from '../../core/rbac';
import { CacheStore, LocalCacheStore } from '../../core/caching';
import { RedisOptions, RedisStore } from '../../connectors/caching';
import { BootLoader } from './types';
import { getConfigs } from '../helpers';
import { Configurations } from '../../types';

/**
 * Initializes MongoDB connections.
 */
async function initializeDatabase(pollingOptions?: PollingOptions) {
  const configs = getConfigs();
  const mongo = new (asBean<Mongo>(Mongo))({
    database: configs.db.name,
    host: configs.db.host,
    port: configs.db.port,
    username: configs.db.username,
    password: configs.db.password,
    tls: configs.db.tls,
  });
  pollingOptions && poll(mongo, pollingOptions);
  return mongo;
}

/**
 * Initializes the default {@link StorageConnector}.
 */
async function initializeStorageConnector() {
  const asStorageConnectorBean = (connectorClass: Class<StorageConnector>) =>
    asBean<StorageConnector>(connectorClass, StorageConnector.name);
  const configs = getConfigs();
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
async function configureJwt() {
  const configs = getConfigs();
  return new (asBean<Jwt>(Jwt))(configs.jwt.privateKey, configs.jwt.expiry);
}

/**
 * Initializes Role-based Access-Control settings.
 */
async function initializeRbac() {
  const configs = getConfigs();
  if (configs.acl.enabled && configs.acl.path) {
    const acl = JSON.parse(fs.readFileSync(configs.acl.path).toString());
    return new (asBean<RbacValidator>(RbacValidator))(acl, true);
  }
}

/**
 * Initializes {@link CacheStore} bean.
 */
async function initializeCacheStore() {
  const configs = getConfigs();
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
  database: boolean;
  storage: boolean;
  jwt: boolean;
  rbac: boolean;
  cache: boolean;
  new: <T extends Configurations>(configs: T) => Promise<void>;
}>;

export default ((init) => async () => {
  init.database && (await initializeDatabase());
  init.storage && (await initializeStorageConnector());
  init.jwt && (await configureJwt());
  init.rbac && (await initializeRbac());
  init.cache && (await initializeCacheStore());
  init.new && (await init.new(getConfigs()));
}) as BootLoader<InitOptions>;
