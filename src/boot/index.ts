import '../global'; // load global context
import { Context } from '../core/context';
import { BeforeInit } from '../core/ioc';
import { withName } from '../core/types';
import { CONFIGURATIONS_CONTEXT_KEY } from './loaders';

/**
 * Starts executing given loaders before running other configured
 * initialization hooks of a specific bean class. The booting process
 * uses {@link BeforeInit} hook to make the loaders execute right
 * after the instance's `super(...)` call. Please don't use `this`
 * inside any loader to avoid further issues.
 * @param loaders a list of asynchronous functions executing in order.
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
        await Context.for(CONFIGURATIONS_CONTEXT_KEY).run(Configs, boot);
      }
    }
    return withName(Bootable, cls.name) as unknown as Class<T>;
  };
}
