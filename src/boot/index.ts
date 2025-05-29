import '../global'; // load global context
import { Context } from '../core/context';
import { BeforeInit } from '../core/ioc';
import { withName } from '../core/types';

/**
 * Starts booting given loaders.
 * @param loaders a list of asynchronous void functions.
 */
export function Boot(...loaders: Function[]) {
  const boot = async () => {
    for (const loader of loaders) {
      await loader();
    }
  };
  return function <T = any>(cls: Class<T>) {
    class Bootable extends (cls as Class<any>) {
      @BeforeInit
      private async __boot__() {
        await Context.for('Configs').run(Configs, boot);
      }
    }
    return withName(Bootable, cls.name) as unknown as Class<T>;
  };
}
