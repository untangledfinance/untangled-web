import Configs, { ConfigStore } from '../../core/config';
import { Context } from '../../core/context';
import { Configurations, Env } from '../../types';

/**
 * Name of the {@link Configurations} context (should not be used else where).
 */
const CONFIGS_CONTEXT_KEY = 'Configs';

/**
 * Returns the global {@link Configurations}.
 */
export function globalConfigs<
  E extends Env = Env,
  T extends Configurations<E> | ConfigStore = Configurations<E>,
>() {
  return Configs as unknown as T;
}

/**
 * Retrieves the {@link Configurations} within the current {@link Context}.
 * @throws an error if not found.
 */
export function useConfigs<
  E extends Env = Env,
  T extends Configurations<E> | ConfigStore = Configurations<E>,
>() {
  return Context.for<T>(CONFIGS_CONTEXT_KEY).getOrThrow();
}

/**
 * Executes a function within a specific {@link Context}.
 * @param configs the initial {@link Context} value.
 * @param func the function.
 */
export function runConfigs<
  E extends Env = Env,
  T extends Configurations<E> = Configurations<E>,
  R = any,
>(configs: T, func: () => R) {
  return Context.for<T>(CONFIGS_CONTEXT_KEY).run(configs, func);
}
