import { config, ioc, logging } from './core';
import { Configurations } from './types';

///
/// Global configurations & utilities.
///

globalThis.Configs = config.default as unknown as Configurations;
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

// https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
BigInt.prototype['toJSON'] = function () {
  return this.toString();
};
