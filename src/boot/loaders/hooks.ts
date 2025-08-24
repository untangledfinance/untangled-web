import { ConfigStore } from '../../core/config';
import { Context } from '../../core/context';
import { Configurations } from '../../types';

/**
 * Retrieves the {@link Configurations} within the current {@link Context}.
 * @throws an error if not found.
 */
export function useConfigs<
  T extends Configurations | ConfigStore = Configurations,
>() {
  return Context.for<T>('Configs').getOrThrow();
}
