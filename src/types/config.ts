import { ethers } from 'ethers';
import { CorsOptions } from '../core/http';

export type Configurations = {
  app: {
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
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    tls?: boolean;
  };
  cache: {
    enabled?: boolean;
    type?: string;
  };
  redis: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: number;
  };
  storage: {
    provider?: string;
    bucketName?: string;
  };
  slack: {
    token?: string;
    channelId?: string;
  };
  gcp: {
    projectId?: string;
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
    evmKey: string;
    stellarKey: string;
  };
  /**
   * Environment variables.
   */
  env: {
    [key: string]: any;
  };
};

declare global {
  /**
   * Global configurations.
   */
  var Configs: Configurations;
}
