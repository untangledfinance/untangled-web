import pino from 'pino';
import { notImplementedYet, withName } from '../types';

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

/**
 * Logging abstraction.
 */
export class Logger {
  readonly name?: string;

  constructor(name?: string) {
    this.name = name?.toLowerCase()?.replaceAll(/[^A-Za-z0-9]+/g, '');
  }

  log(level: LogLevel, message: string, ...args: any[]) {
    throw notImplementedYet();
  }

  debug(message: string, ...args: any[]) {
    return this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]) {
    return this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    return this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]) {
    return this.log(LogLevel.ERROR, message, ...args);
  }
}

/**
 * A {@link Logger} which simply uses `console.log` to print message out.
 */
export class SimpleLogger extends Logger {
  override log(level: LogLevel, message: string, ...args: any[]) {
    const nameMaxLength = 6;
    const name = this.name
      ? `[${this.name.padEnd(nameMaxLength, '.').slice(0, nameMaxLength)}]`
      : '--';
    const now = new Date().toISOString();
    console.log(`${now} ${level.padEnd(5)} ${name} ${message}`, ...args);
  }
}

export class PinoLogger extends Logger {
  private readonly logger: pino.Logger;

  constructor(
    name?: string,
    options?: pino.LoggerOptions | pino.DestinationStream
  ) {
    super(name);
    this.logger = pino({
      name,
      level: 'debug',
      ...(options || {}),
    });
  }

  override log(level: LogLevel, message: string, ...args: any[]) {
    const log = (() => {
      switch (level) {
        case LogLevel.DEBUG:
          return this.logger.debug;
        case LogLevel.INFO:
          return this.logger.info;
        case LogLevel.ERROR:
          return this.logger.error;
        case LogLevel.WARN:
          return this.logger.warn;
      }
    })().bind(this.logger);

    if (args.length) {
      log(`${message} -- %o`, args);
    } else {
      log(message);
    }
  }
}

/**
 * Quickly creates a {@link Logger}.
 * @param name name of the {@link Logger}.
 * @param type type of the {@link Logger} (default: {@link PinoLogger}).
 */
export function createLogger(
  name?: string,
  type: Class<Logger> = PinoLogger
): Logger {
  return new type(name);
}

/**
 * Injects a {@link Logger} when instantiating a class.
 * @param cls the class.
 * @param name name of the {@link Logger}.
 * @param type type of the {@link Logger}.
 */
export function Log<T>(
  cls: Class<T> | AbstractClass<T>,
  name?: string,
  type?: Class<Logger>
) {
  return withName(
    class extends (cls as Class<any>) {
      readonly logger: Logger;

      constructor(...args: any[]) {
        super(...args);
        this.logger = createLogger(name ?? cls.name, type);
      }
    } as Class<
      T & {
        logger: Logger;
      }
    >,
    name ?? cls.name
  );
}

export default createLogger();
