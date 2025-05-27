import config, { ConfigStore } from '../core/config';
import { Context } from '../core/context';
import { Configurations } from '../types';

export function configStore() {
  return Context.for<ConfigStore>('Configs', config).get();
}

export function getConfigs() {
  return configStore() as unknown as Configurations;
}
