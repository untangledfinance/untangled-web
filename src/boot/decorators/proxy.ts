import { ProxyDecorator, ProxyStore } from '../../core/http';
import { Configurations } from '../../types';

/**
 * Marks a handler as a proxy.
 */
export const createProxyDecorator = (configs: () => Configurations) =>
  ProxyDecorator(
    new (class extends ProxyStore {
      get(key: string) {
        return configs()?.proxy?.[key.toUpperCase()];
      }
    })()
  );
