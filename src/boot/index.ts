import '../global'; // load global context
import { BeforeInit } from '../core/ioc';
import {
  ClassDecorator,
  classOf,
  getSymbol,
  withName,
  withSymbol,
} from '../core/types';
import { BootLoader, globalConfigs, runConfigs } from './loaders';

const BootSymbol = Symbol.for('__boot__');

type BootDecorator = ((...loaders: BootLoader[]) => ClassDecorator) & {
  /**
   * Starts executing given loaders before running other configured
   * initialization hooks of a specific bean class. The booting process
   * uses {@link BeforeInit} hook to make the loaders execute right
   * after the instance's `super(...)` call. Please don't use `this`
   * inside any loader to avoid further issues.
   * @param loaders a list of asynchronous functions executing in order.
   */
  Legacy: (...loaders: BootLoader[]) => ClassDecorator;
};

/**
 * Attaches given loaders to be executed before a specific bean class
 * initialization. The bean must be instantiated via the {@link boot}
 * function in order to actually execute the loaders. For the legacy
 * version, see the {@link Boot.Legacy} decorator.
 * @param loaders a list of asynchronous functions executing in order.
 */
export const Boot: BootDecorator = function (...loaders: BootLoader[]) {
  const legacy = (this as any)?.legacy === true;
  const beforeInit = async () => {
    for (const loader of loaders) {
      await loader();
    }
  };
  return function <T = any>(cls: Class<T>) {
    class Bootable extends (cls as Class<any>) {
      @BeforeInit
      private async __boot__() {
        await runConfigs(globalConfigs(), beforeInit);
      }
    }
    const boot = legacy ? () => Promise.resolve() : beforeInit;
    const bootable = legacy ? withName(Bootable, cls.name) : cls;
    return withSymbol(bootable, BootSymbol, boot) as unknown as Class<T>;
  };
};

Boot.Legacy = function (...loaders: BootLoader[]) {
  return Boot.bind({
    legacy: true,
  })(...loaders);
};

/**
 * Boots a given bean class.
 * @param cls the bean class.
 * @param args arguments to instantiate the bean.
 * @returns instance of the bean.
 * @throws an error if the bean class isn't decorated with {@link Boot}.
 */
export function boot<T = any>(cls: Class<T>, ...args: any[]) {
  return runConfigs(globalConfigs(), async () => {
    let beforeInit = getSymbol<() => Promise<void>>(cls, BootSymbol);
    if (typeof beforeInit !== 'function') {
      const clz = classOf(cls); // original class
      beforeInit = getSymbol(clz, BootSymbol);
      if (typeof beforeInit !== 'function') {
        throw new Error(
          `Class '${cls.name}' must be used with \`${Boot.name}\` decorator`
        );
      }
    }
    await beforeInit();
    return new cls(...args);
  });
}
