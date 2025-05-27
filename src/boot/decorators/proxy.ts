import { ProxyDecorator, ProxyStore } from '../../core/http';
import { getConfigs } from '../helpers';

/**
 * Marks a handler as a proxy.
 */
export const Proxy = ProxyDecorator(
  new (class extends ProxyStore {
    get(key: string) {
      const configs = getConfigs();
      return configs.proxy[key.toUpperCase()];
    }
  })()
);
