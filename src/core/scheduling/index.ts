import { CronJob } from 'cron';
import { Callable, isString, notImplementedYet, withName } from '../types';
import { OnStop } from '../ioc';
import { createLogger } from '../logging';

const logger = createLogger('cron');

/**
 * Delays for specific milliseconds.
 * @param ms the milliseconds.
 */
export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const JobCronSymbol = Symbol.for('__job_config__');
const JobSymbol = Symbol.for('__job__');

/**
 * A {@link Job} configuration store.
 */
export abstract class CronStore {
  /**
   * Retrieves a specific task's cron time.
   * @param key the task key.
   */
  public abstract get(key: string): Promise<{
    key: string;
    cron: string;
  }>;
}

/**
 * Marks a {@link Job} class method as a scheduled task.
 * @param expression its cron expression or {@link CronStore}.
 */
export function Cron(expression: string | CronStore) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const handler = descriptor.value;
    if (handler instanceof Function) {
      target[JobCronSymbol] = [
        ...(target[JobCronSymbol] ?? []),
        {
          expression,
          handler,
        },
      ];
    }
  };
}

type RunnerEvent = 'started' | 'completed' | 'failed' | 'run' | 'stopped';
type RunnerStartedHandler = (
  task: string,
  ...data: any[]
) => void | Promise<void>;
type RunnerCompletedHandler = (
  task: string,
  ...data: any[]
) => void | Promise<void>;
type RunnerFailedHandler = (
  task: string,
  error: Error,
  ...data: any[]
) => void | Promise<void>;
type RunnerRunHandler = (task: string, ...data: any[]) => void | Promise<void>;
type RunnerStoppedHandler = (
  task: string,
  ...data: any[]
) => void | Promise<void>;

/**
 * An abstraction for a scheduled job.
 */
export class Runner extends Callable<Promise<void>> {
  private readonly eventHandlers = {} as Record<string, Function[]>;

  protected override _() {
    return this.run();
  }

  /**
   * Adds a handler for a specific event.
   * @param event name of the event.
   * @param handler the handler.
   */
  on(event: RunnerEvent, handler: Function): this {
    const eventName = event.toLowerCase();
    const handlers = this.eventHandlers[eventName] ?? [];
    this.eventHandlers[eventName] = [...handlers, handler];
    return this;
  }

  /**
   * Emits an event.
   * @param event name of the event.
   * @param data data to pass into the handlers.
   */
  emit(event: RunnerEvent, ...data: any[]) {
    const eventName = event.toLowerCase();
    const handlers = this.eventHandlers[eventName] ?? [];
    setImmediate(async () => {
      for (const handler of handlers) {
        const h = handler?.(...data);
        h instanceof Promise && (await h);
      }
    });
  }

  /**
   * Adds a handler for event `started`.
   * @param handler the handler.
   */
  onStarted(handler: RunnerStartedHandler) {
    return this.on('started', handler);
  }

  /**
   * Adds a handler for event `completed`.
   * @param handler the handler.
   */
  onCompleted(handler: RunnerCompletedHandler) {
    return this.on('completed', handler);
  }

  /**
   * Adds a handler for event `failed`.
   * @param handler the handler.
   */
  onFailed(handler: RunnerFailedHandler) {
    return this.on('failed', handler);
  }

  /**
   * Adds a handler for event `run` (`completed` or `failed`).
   * @param handler the handler.
   */
  onRun(handler: RunnerRunHandler) {
    return this.on('run', handler);
  }

  /**
   * Adds a handler for event `stopped`.
   * @param handler the handler.
   */
  onStopped(handler: RunnerStoppedHandler) {
    return this.on('stopped', handler);
  }

  /**
   * Starts the scheduled job's execution.
   */
  run(): Promise<void> {
    throw notImplementedYet();
  }
}

/**
 * Provides utilities to manage {@link Runner}s.
 */
class _Runners {
  private readonly runners = new Map<string, Class<Runner>>();

  /**
   * Adds a specific {@link Runner} type to manage.
   * @param type type of the {@link Runner}.
   * @returns name of the type.
   * @throws an error if a type with the same name exists.
   */
  add(type: Class<Runner>): string {
    const name = type.name;
    if (this.runners.has(name)) {
      throw new Error(`Runner '${name}' exists`);
    }
    this.runners.set(name, type);
    return name;
  }

  /**
   * Retrieves a {@link Runner} type by a given name.
   * @param name name of the type.
   * @throws an error if no type with the same name exists.
   */
  get(name: string): Class<Runner> {
    const cls = this.runners.get(name);
    if (!cls) {
      throw new Error(`Runner '${name}' not found`);
    }
    return cls;
  }

  /**
   * Retrieves a {@link CronJob} task mapping of a {@link Runner}.
   */
  getTasks(runner: Runner): Record<string, CronJob> {
    if (!(runner instanceof Runner)) {
      throw new Error(`Not a Runner`);
    }
    return runner[JobSymbol] ?? {};
  }

  /**
   * Retrieves a {@link CronJob} task from a {@link Runner} by a specific key.
   */
  getTask(runner: Runner, key: string): CronJob | undefined {
    return this.getTasks(runner)[key];
  }

  /**
   * Associates a {@link CronJob} task to a {@link Runner} by a given key.
   */
  setTask(runner: Runner, key: string, job: CronJob): void {
    const tasks = this.getTasks(runner);
    runner[JobSymbol] = {
      ...tasks,
      [key]: job,
    };
  }

  /**
   * Deletes a {@link CronJob} task from a {@link Runner} by a given key.
   * @returns the deleted {@link CronJob} task if found.
   */
  deleteTask(runner: Runner, key: string): CronJob | undefined {
    const task = this.getTask(runner, key);
    if (task) {
      delete runner[JobSymbol][key];
      return task;
    }
  }
}

/**
 * Manages {@link Runner}s.
 */
export const Runners = new _Runners();

/**
 * Options for the {@link Job} decorator.
 */
type JobDecoratorOptions = {
  /**
   * Specifies that the {@link CronJob} only runs once.
   */
  once?: boolean;
};

/**
 * Allows a {@link Runner} class to schedule jobs.
 * @param cls the class.
 */
export function Job<C extends Class<Runner>>(cls: C): C {
  const { once } = (this ?? {}) as JobDecoratorOptions;
  const stop = (runner: Runner, key: string) => {
    try {
      const job = Runners.deleteTask(runner, key);
      job?.stop();
    } catch (err) {
      logger.error(`${err.message}\n`, err);
    }
  };
  const runnerType = withName(
    class extends cls implements OnStop {
      async onStop() {
        for (const cronKey of Object.keys(Runners.getTasks(this))) {
          stop(this, cronKey);
          this.emit('stopped', cronKey);
        }
      }

      constructor(...args: any[]) {
        super(...args);
        if (!(this instanceof Runner)) {
          throw new Error(`Class "${cls.name}" is not a Runner`);
        }
        const jobs = (cls.prototype[JobCronSymbol] ?? []) as {
          expression: string | CronStore;
          handler: Function;
        }[];
        for (const { expression, handler } of jobs) {
          (async () => {
            try {
              let cronKey = `${cls.name}#${handler.name}`;
              let cronTime = expression;
              if (expression instanceof CronStore) {
                const config = await expression.get(cronKey);
                cronKey = config.key;
                cronTime = config.cron;
              }
              if (!isString(cronTime)) {
                throw new Error(
                  `Cron time invalid "${cronTime}" for task "${cronKey}"`
                );
              }
              const job = new CronJob(
                cronTime,
                async () => {
                  try {
                    this.emit('started', cronKey);
                    const value = handler.bind(this)();
                    value instanceof Promise && (await value);
                    this.emit('completed', cronKey);
                    once && stop(this, cronKey);
                  } catch (err) {
                    logger.error(`${err.message}\n`, err);
                    this.emit('failed', cronKey, err);
                  } finally {
                    this.emit('run', cronKey);
                  }
                },
                null,
                false
              );
              job.start();
              Runners.setTask(this, cronKey, job);
            } catch (err) {
              logger.warn(err.message);
            }
          })();
        }
      }
    } as C,
    cls.name
  );
  Runners.add(runnerType);
  return runnerType;
}

/**
 * A {@link Job} that only runs once.
 */
export const Once = Job.bind({
  once: true,
} as JobDecoratorOptions) as typeof Job;
