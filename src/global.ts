import { config, event, ioc, logging, pubsub, types } from './core';
import { Configurations } from './types';

///
/// Logging utilities.
///

const useLogger = () => {
  let logger = logging.LOGGER;
  try {
    logger = ioc.beanOf(logging.Logger);
  } catch {}
  return logger;
};

///
/// Event utilities.
///

const usePublisher = () => {
  let publisher = {
    async publish<T>(message: T, ...channels: string[]) {
      channels.forEach((channel) => event.emit(channel, message));
    },
  };
  try {
    publisher = ioc.beanOf(pubsub.Publisher);
  } catch {}
  return publisher;
};

const useSubscriber = () => {
  let subscriber = {
    async subscribe<T>(
      handler: (message: T, channel: string) => void | Promise<void>,
      ...channels: string[]
    ) {
      const unsubscribes = channels.map((channel) =>
        event.on(channel, (e: { key: string; data: T }) =>
          handler(e.data, e.key)
        )
      );
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
  };
  try {
    subscriber = ioc.beanOf(pubsub.Subscriber);
  } catch {}
  return subscriber;
};

///
/// `console.log` overrides.
///

const asLoggingArgs = (data: any[]): [string, ...any[]] => {
  const message =
    typeof data.at(0) === 'string' ? data.at(0) : data.at(0)?.toString() || '';
  const args = data.slice(1);
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
globalThis.emit = async <T>(message: T, ...channels: string[]) => {
  const publisher = usePublisher();
  return publisher.publish(message, ...channels);
};
globalThis.on = async <T>(
  handler: (message: T, channel: string) => void | Promise<void>,
  ...channels: string[]
) => {
  const subscriber = useSubscriber();
  return subscriber.subscribe(handler, ...channels);
};

///
/// Serialization configurations.
///

// https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
BigInt.prototype['toJSON'] = function () {
  return types.noBigInt(this);
};
