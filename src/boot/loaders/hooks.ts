import { ConfigStore } from '../../core/config';
import { Context } from '../../core/context';
import { Configurations, Env } from '../../types';

/**
 * Name of the {@link Configurations} context (should not be used else where).
 */
export const CONFIGURATIONS_CONTEXT_KEY = 'Configs';

/**
 * Retrieves the {@link Configurations} within the current {@link Context}.
 * @throws an error if not found.
 */
export function useConfigs<
  E extends Env = Env,
  T extends Configurations | ConfigStore = Configurations,
>() {
  return Context.for<
    T & {
      /**
       * Structural environment variables.
       */
      env: E;
    }
  >(CONFIGURATIONS_CONTEXT_KEY).getOrThrow();
}

/**
 * Executes a function within a specific {@link Context}.
 * @param configs the initial {@link Context} value.
 * @param func the function.
 */
export function runConfigs<T extends Configurations = Configurations, R = any>(
  configs: Partial<T>,
  func: () => R
) {
  return Context.for<T>(CONFIGURATIONS_CONTEXT_KEY).run(configs as T, func);
}
