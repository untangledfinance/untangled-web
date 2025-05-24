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

class SimpleLogger extends Logger {
  get now() {
    return new Date().toISOString();
  }

  override log(level: LogLevel, message: string, ...args: any[]) {
    const nameMaxLength = 6;
    const name = this.name
      ? `[${this.name.padEnd(nameMaxLength, '.').slice(0, nameMaxLength)}]`
      : '--';
    console.log(`${this.now} ${level.padEnd(5)} ${name} ${message}`, ...args);
  }
}

/**
 * Quickly creates a {@link Logger}.
 * @param name name of the {@link Logger}.
 */
export function createLogger(name?: string): Logger {
  return new SimpleLogger(name);
}

/**
 * Injects a {@link Logger} when instantiating a class.
 * @param cls the class.
 * @param name name of the {@link Logger}.
 */
export function Log<T>(cls: Class<T> | AbstractClass<T>, name?: string) {
  return withName(
    class extends (cls as Class<any>) {
      readonly logger: Logger;

      constructor(...args: any[]) {
        super(...args);
        this.logger = createLogger(name ?? cls.name);
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
