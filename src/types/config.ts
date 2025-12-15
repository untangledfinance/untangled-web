import { ethers } from 'ethers';
import { CorsOptions } from '../core/http';

/**
 * Structure for environment variables.
 */
export type Env = {
  [key: string]: any;
};

/**
 * Structure for configurations.
 */
export type Configurations<E extends Env = Env> = {
  system: {
    name?: string;
  };
  app: {
    registry?: string;
    url?: string;
    icon?: string;
    name?: string;
    version?: string;
    description?: string;
    host?: string;
    port?: number;
  };
  cors: Partial<CorsOptions> | '*';
  proxy: {
    [key: string]: string;
  };
  job: {
    enabled?: boolean;
  };
  jwt: {
    privateKey?: string;
    expiry?: number;
  };
  acl: {
    path?: string;
    enabled?: boolean;
  };
  db: {
    mongo: {
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      authDatabase?: string;
      tls?: boolean;
    };
    postgres: {
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      tls?: boolean;
      migrationRoot?: string;
    };
    sqlite: {
      database?: string;
      migrationRoot?: string;
      enableWAL?: boolean;
      busyTimeout?: number;
    };
    redis: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: number;
    };
  };
  cache: {
    enabled?: boolean;
    type?: string;
  };
  queue: {
    type: string;
    redis: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: number;
    };
  };
  pubsub: {
    type: string;
    redis: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: number;
    };
  };
  storage: {
    provider?: 'gcp' | 'aws';
    bucketName?: string;
  };
  slack: {
    token?: string;
    channelId?: string;
  };
  gcp: {
    projectId?: string;
  };
  aws: {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  rpc: {
    [chainId: `${number}` | number]:
      | (ethers.JsonRpcProvider & { url: string })
      | undefined;
  };
  subgraph: {
    [chainId: number]: string;
  };
  tx: {
    [key: string]: string;
  };
  /**
   * Structural environment variables.
   */
  env: E;
};

declare global {
  /**
   * Global configurations.
   */
  var Configs: Configurations;
}
