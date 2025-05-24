import { config, ioc, logging } from './core';
import { Configurations } from './types';

export * as core from './core';
export * as types from './types';

globalThis.Singleton = ioc.asSingleton;
globalThis.Bean = ioc.asBean;
globalThis.Auto = ioc.autoBean;
globalThis.$ = ioc.beanOf; // support global invocation with '$' symbol
globalThis.log = (message: string, ...args: any[]) => {
  let logger = logging as unknown as logging.Logger;
  try {
    logger = ioc.beanOf(logging.Logger);
  } catch {}
  return logger.log(logging.LogLevel.INFO, message, ...args);
};

const ConfigStore = ioc.asBean<config.ConfigStore>(config.ConfigStore);
globalThis.Configs = new ConfigStore() as unknown as Configurations;
