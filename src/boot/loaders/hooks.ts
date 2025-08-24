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
