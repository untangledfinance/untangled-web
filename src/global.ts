import { config, ioc, logging } from './core';
import { Configurations } from './types';

///
/// `console.log` Overrides.
///

const useLogger = () => {
  let logger = logging.LOGGER;
  try {
    logger = ioc.beanOf(logging.Logger);
  } catch {}
  return logger;
};

const asLoggingArgs = (data: any[]): [string, ...any[]] => {
  const message = typeof data.at(0) === 'string' ? data.at(0) : '--';
  const args = message ? data.slice(1) : data;
  return [message, ...args];
};

console.log = (...data: any[]) => useLogger().info(...asLoggingArgs(data));
console.info = (...data: any[]) => useLogger().info(...asLoggingArgs(data));
console.error = (...data: any[]) => useLogger().error(...asLoggingArgs(data));
console.debug = (...data: any[]) => useLogger().debug(...asLoggingArgs(data));
console.warn = (...data: any[]) => useLogger().warn(...asLoggingArgs(data));

///
/// Global configurations & utilities.
///

globalThis.Configs = config.default as unknown as Configurations;
globalThis.Singleton = ioc.asSingleton;
globalThis.Bean = ioc.asBean;
globalThis.Auto = ioc.autoBean;
globalThis.$ = ioc.beanOf; // support global invocation with '$' symbol
globalThis.log = (message: string, ...args: any[]) => {
  const logger = useLogger();
  return logger.log(logging.LogLevel.INFO, message, ...args);
};

///
/// Serialization configurations.
///

// https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
BigInt.prototype['toJSON'] = function () {
  return this.toString();
};
