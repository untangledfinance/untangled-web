import { createLogger } from '../logging';
import { classOf, isClass, Symbolization, withClass, withName } from '../types';

const logger = createLogger('ioc');

const AutoSymbol = Symbol.for('__auto__');

/**
 * Returns a singleton version of a class.
 * @param cls the class.
 */
export function asSingleton<C extends Class<any>>(cls: C) {
  let instance: any;
  const singleton = withName(
    class {
      constructor(...args: any[]) {
        return (instance ??
          (function () {
            instance = withClass(new cls(...args), cls);
            return instance;
          })()) as any;
      }
    } as C,
    cls.name
  );
  return singleton;
}

/**
 * An Inversion-of-Control container.
 */
const Container = asSingleton(
  class extends Map<string, any> {
    /**
     * Retrieves an instance with a given name from the container.
     * @param name the name.
     * @param filter only return the instance if the condition mets.
     * @returns the found instance.
     * @throws an error if no instance found.
     */
    override get<T>(name: string, filter?: (bean: T) => boolean) {
      const instance = super.get(name) as T;
      const found = (filter || ((bean: T) => !!bean))(instance);
      if (found) {
        return instance;
      }
      throw new Error(`Bean "${name}" not found`);
    }

    /**
     * {@link get} but without throwing an error when no instance found.
     */
    unsafeGet<T>(name: string, filter?: (bean: T) => boolean): T | undefined {
      try {
        return this.get<T>(name, filter);
      } catch {}
    }

    /**
     * Adds an instance with a given name into the container.
     * @param name the name.
     * @param instance the instance.
     * @returns the added instance.
     * @throws an error if a instance with the same name exists.
     */
    add<T>(name: string, instance: T, cls: Class<T> | AbstractClass<T>) {
      if (super.has(name)) {
        throw new Error(`Bean "${name}" exists`);
      }
      super.set(name, withClass(instance, cls as Class<T>));
      return instance;
    }

    /**
     * Removes an instance from the container.
     * @param name name of the instance.
     */
    remove<T>(name: string) {
      if (super.has(name)) {
        const instance = super.get(name) as T;
        if (super.delete(name)) {
          return {
            /**
             * Name of the removed instance.
             */
            name,
            /**
             * The instance.
             */
            instance,
            /**
             * Class of the instance.
             */
            type: classOf(instance),
          };
        }
      }
    }
  }
);

const PreConstructSymbol = Symbol('PreConstruct');
const PostConstructSymbol = Symbol('PostConstruct');
const PreDestroySymbol = Symbol('PreDestroy');

/**
 * Runs the associated method before its {@link Bean}'s initialization
 * (no `this` binding).
 */
export const BeforeInit = Symbolization.createDecorator(PreConstructSymbol);

/**
 * Runs the associated method right after its {@link Bean}'s initialization.
 */
export const AfterInit = Symbolization.createDecorator(PostConstructSymbol);
export interface OnInit {
  onInit(): Promise<void>;
}

/**
 * Runs the associated method right before its {@link Bean}'s deletion.
 */
export const PreDestroy = Symbolization.createDecorator(PreDestroySymbol);
export interface OnStop {
  onStop(): Promise<void>;
}

/**
 * Retrieves all initialized {@link Bean}s' registered names
 * in the default IoC {@link Container}.
 */
export function beans() {
  return [...new Container().keys()];
}

/**
 * Retrieves the instance of a {@link Bean} class.
 * @param cls the class or its name.
 * @param unsafe not throwing error if no instance found.
 * @throws an error if no instance found.
 */
export function beanOf<T>(cls: Class<T> | string, unsafe?: boolean) {
  let clz: Class<T>;
  if (!isClass(cls)) {
    clz = withName(
      class extends String {},
      cls as string
    ) as unknown as Class<T>; // to get the class name
  } else {
    clz = cls as unknown as Class<T>;
  }
  if ((clz as any)[AutoSymbol]) {
    new clz();
  }
  return unsafe
    ? new Container().unsafeGet<T>(clz.name)
    : new Container().get<T>(clz.name);
}

/**
 * Removes a specific {@link Bean} if it exists.
 * @param cls class of the {@link Bean}.
 * @param name a specific name of the {@link Bean}.
 * @param filter only remove the {@link Bean} if the condition mets.
 * @throws an {@link Error} if the {@link Bean} couldn't be found.
 */
export function destroy<T>(
  cls: Class<T> | AbstractClass<T>,
  name?: string,
  filter?: (instance: T) => boolean
) {
  const container = new Container();
  const beanName = name ?? cls.name;
  const bean = container.unsafeGet<T>(beanName, filter);
  if (!bean) {
    return {
      name: beanName,
      instance: undefined,
      type: cls as Class<T>,
    };
  }
  const removed = container.remove<T>(beanName);
  if (!removed) {
    throw new Error(`Deletion for bean "${beanName}" could not be processed`);
  }
  const { instance, type } = removed;
  Symbolization.process(type, PreDestroySymbol, instance, {
    skip: ['onStop'],
  });
  (instance as OnStop).onStop?.();
  return removed;
}

/**
 * Restarts a {@link Bean} by {@link destroy}ing it and
 * re-creating a new one with the same type.
 * @param cls class of the {@link Bean}.
 * @param name a specific name of the {@link Bean}.
 * @param args arguments for re-initialization.
 */
export function restart<T>(
  cls: Class<T> | AbstractClass<T>,
  name?: string,
  ...args: any[]
) {
  const removed = destroy(cls, name ?? cls.name);
  const { type, instance, name: beanName } = removed;
  if (!instance) {
    throw new Error(`Bean "${beanName}" not found`);
  }
  const beanType = asBean(type, beanName);
  return {
    /**
     * The removed instance of the {@link Bean}.
     */
    previous: instance as T,
    /**
     * The newly-created instance of the {@link Bean}.
     */
    current: new beanType(...args) as T,
  };
}

/**
 * Removes all {@link Bean}s.
 */
export function shutdown() {
  beans().forEach((beanName) => {
    try {
      destroy(Object, beanName);
    } catch (err) {
      logger.error(`${err.message}\n`, err);
    }
  });
}

/**
 * Registers a specific instance as a {@link Bean} of a given class.
 * @param instance the instance.
 * @param cls the class.
 * @param name name of the bean.
 */
export function register<T>(
  instance: T,
  cls: Class<T> | AbstractClass<T>,
  name?: string
) {
  const beanName = name ?? cls.name;
  new Container().add(beanName, instance, cls);
}

/**
 * Converts a class to an IoC bean.
 * @param cls the class.
 * @returns a {@link Singleton} version of the given class.
 */
export function asBean<T>(cls: Class<any>, name?: string): Class<T> {
  const singleton = asSingleton<typeof cls>(
    class extends cls {
      constructor(...args: any[]) {
        super(...args);
        new Container().add(name ?? cls.name, this, cls);
        const onInit = () => {
          (this as unknown as OnInit).onInit?.();
          Symbolization.process(cls, PostConstructSymbol, this, {
            skip: ['onInit'],
          });
        };
        Symbolization.process(cls, PreConstructSymbol, undefined, {
          onComplete: onInit,
        });
        return this;
      }
    }
  );
  return withName(singleton, name ?? cls.name);
}

/**
 * Immediately initializes a bean when calling {@link beanOf}.
 * @param cls the class.
 */
export function autoBean<T>(cls: Class<any>): Class<T> {
  const beanClass = asBean<T>(cls);
  Object.defineProperty(beanClass, AutoSymbol, {
    value: true,
  });
  return beanClass;
}
