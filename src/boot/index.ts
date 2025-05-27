import { withName } from '../core/types';

/**
 * Starts booting given loaders.
 * @param loaders a list of asynchronous void functions.
 */
export function Boot(...loaders: Function[]) {
  return function <T = any>(cls: Class<T>) {
    return withName(
      class extends (cls as Class<any>) {
        constructor(...args: any[]) {
          (async () => {
            for (const loader of loaders) {
              await loader();
            }
          })();
          super(...args);
        }
      },
      cls.name
    ) as unknown as Class<T>;
  };
}
