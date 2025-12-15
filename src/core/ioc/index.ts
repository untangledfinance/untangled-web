import asyncHooks from 'async_hooks';
import 'reflect-metadata';
import { createLogger } from '../logging';
import {
  Symbolization,
  classOf,
  hasSymbol,
  isClass,
  withClass,
  withName,
  withSymbol,
} from '../types';

const logger = createLogger('ioc');

const SingletonSymbol = Symbol.for('__singleton__');
const BeanSymbol = Symbol.for('__bean__');
const AutoSymbol = Symbol.for('__auto__');

/**
 * Metadata key for storing stable bean names.
 * Uses Symbol.for() for cross-module consistency.
 * Captured at decoration time to survive minification.
 */
const BEAN_NAME_KEY = Symbol.for('ioc:bean:name');

/**
 * Stores a stable bean name as metadata on a class.
 * Called at decoration time to capture the name before minification.
 * Only sets metadata if not already defined (first decorator wins).
 * @param cls The class constructor
 * @param name The stable bean name to store
 */
function setBeanName<T>(cls: Class<T> | AbstractClass<T>, name: string): void {
  if (!Reflect.hasMetadata(BEAN_NAME_KEY, cls)) {
    Reflect.defineMetadata(BEAN_NAME_KEY, name, cls);
  }
}

/**
 * Retrieves the stable bean name from class metadata.
 * Returns undefined if no metadata has been set.
 * @param cls The class constructor
 * @returns The stored bean name, or undefined if not set
 */
function getBeanName<T>(cls: Class<T> | AbstractClass<T>): string | undefined {
  return Reflect.getMetadata(BEAN_NAME_KEY, cls);
}

/**
 * Resolves the bean name using priority chain:
 * 1. Explicit name parameter (if provided)
 * 2. Metadata stored on class (minification-safe)
 * 3. cls.name fallback (for non-decorated classes)
 *
 * @param cls The class constructor
 * @param explicitName Optional explicit name override
 * @returns The resolved bean name
 */
function resolveBeanName<T>(
  cls: Class<T> | AbstractClass<T>,
  explicitName?: string
): string {
  if (explicitName) {
    return explicitName;
  }
  const metadataName = getBeanName(cls);
  if (metadataName) {
    return metadataName;
  }
  return cls.name;
}

/**
 * Returns a singleton version of a class.
 * @param cls the class.
 */
export function asSingleton<C extends Class<any>>(cls: C) {
  let instance: any;
  const className = cls.name;

  // Store class name in metadata to survive minification
  setBeanName(cls, className);

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
    className
  );

  // Also store on wrapper class
  setBeanName(singleton, className);

  return withClass(withSymbol(singleton, SingletonSymbol), cls);
}

/**
 * Checks if a class is singleton or not.
 * @param cls the class.
 */
export function isSingleton<T>(cls: Class<T>) {
  return hasSymbol(cls, SingletonSymbol);
}

/**
 * An Inversion-of-Control container.
 */
class _Container {
  protected readonly beans: Map<string, any>;

  constructor() {
    this.beans = new Map<string, any>();
  }

  /**
   * All registered beans' names.
   */
  get names() {
    return [...this.beans.keys()];
  }

  /**
   * Finds all beans that match a given filter.
   * @param filter the bean filter by name and instance.
   */
  find(filter?: (name: string, instance: any) => boolean) {
    return this.beans
      .entries()
      .filter(([name, instance]) => (filter ? filter(name, instance) : true))
      .reduce(
        (m, [name, instance]) => ({ ...m, [name]: instance }),
        {} as Record<string, any>
      );
  }

  /**
   * Retrieves an instance with a given name from the container.
   * @param name the name.
   * @param filter only return the instance if the condition mets.
   * @returns the found instance.
   * @throws an error if no instance found.
   */
  get<T>(name: string, filter?: (bean: T) => boolean) {
    const instance = this.beans.get(name) as T;
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
    if (this.beans.has(name)) {
      throw new Error(`Bean "${name}" exists`);
    }
    this.beans.set(name, withClass(instance, cls as Class<T>));
    return instance;
  }

  /**
   * Removes an instance from the container.
   * @param name name of the instance.
   */
  remove<T>(name: string) {
    if (this.beans.has(name)) {
      const instance = this.beans.get(name) as T;
      if (this.beans.delete(name)) {
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

/**
 * The singleton IoC container.
 */
const Container = new _Container();

const PreConstructSymbol = Symbol('PreConstruct');
const PostConstructSymbol = Symbol('PostConstruct');
const PreDestroySymbol = Symbol('PreDestroy');

/**
 * Runs the associated method before its bean's initialization
 * (no `this` binding). The current implementation lets the method
 * execute right after the `super(...)` call of the bean.
 */
export const BeforeInit = Symbolization.createDecorator(PreConstructSymbol);

/**
 * Runs the associated method right after its bean's initialization.
 */
export const AfterInit = Symbolization.createDecorator(PostConstructSymbol);
export interface OnInit {
  /**
   * Should execute right after a bean's initialization.
   */
  onInit(): Promise<void>;
}

/**
 * Runs the associated method right before its bean's deletion.
 */
export const PreDestroy = Symbolization.createDecorator(PreDestroySymbol);
export interface OnStop {
  /**
   * Should execute right before a bean's deletion.
   */
  onStop(): Promise<void>;
}

/**
 * Retrieves all initialized beans' registrations in the {@link Container}.
 * @param filter the bean filter by name and instance.
 */
export function beans(filter?: (name: string, instance: any) => boolean) {
  return Container.find(filter);
}

/**
 * Retrieves the instance of a bean class.
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
  if (hasSymbol(clz, AutoSymbol)) {
    new clz();
  }
  // Use metadata resolution instead of directly accessing cls.name
  const name = isClass(cls) ? resolveBeanName(clz) : (cls as string);
  return unsafe ? Container.unsafeGet<T>(name) : Container.get<T>(name);
}

/**
 * Attaches a bean class before trying to retrieve its instance.
 * @param cls the class.
 * @returns the {@link beanOf} function that accepts the bean name.
 */
beanOf.type = <T>(cls: Class<T> | AbstractClass<T>) => {
  return (name: string, unsafe?: boolean) => {
    const found = beanOf<T>(name, unsafe);
    if (found && !(found instanceof cls)) {
      throw new Error(`${name} is not ${resolveBeanName(cls)}`);
    }
    return found;
  };
};

/**
 * Removes a specific bean if it exists.
 * @param cls class of the bean.
 * @param name a specific name of the bean.
 * @param filter only remove the bean if the condition mets.
 * @throws an {@link Error} if the bean couldn't be found.
 */
export function destroy<T>(
  cls: Class<T> | AbstractClass<T>,
  name?: string,
  filter?: (instance: T) => boolean
) {
  // Use metadata resolution instead of directly accessing cls.name
  const beanName = name ?? resolveBeanName(cls);
  const bean = Container.unsafeGet<T>(beanName, filter);
  if (!bean) {
    return {
      name: beanName,
      instance: undefined,
      type: cls as Class<T>,
    };
  }
  const removed = Container.remove<T>(beanName);
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
 * Restarts a bean by {@link destroy}ing it and
 * re-creating a new one with the same type.
 * @param cls class of the bean.
 * @param name a specific name of the bean.
 * @param args arguments for re-initialization.
 */
export function restart<T>(
  cls: Class<T> | AbstractClass<T>,
  name?: string,
  ...args: any[]
) {
  // Use metadata resolution instead of directly accessing cls.name
  const beanName = name ?? resolveBeanName(cls);
  const removed = destroy(cls, beanName);
  const { type, instance, name: removedBeanName } = removed;
  if (!instance) {
    throw new Error(`Bean "${removedBeanName}" not found`);
  }
  const beanType = asBean(type, removedBeanName);
  return {
    /**
     * The removed instance of the bean.
     */
    previous: instance as T,
    /**
     * The newly-created instance of the bean.
     */
    current: new beanType(...args) as T,
  };
}

/**
 * Removes all beans and then shuts down.
 * @param timeout timeout in milliseconds to call `process.exit`.
 * @see process.exit
 */
export function shutdown(timeout = 20000) {
  const asyncIds = new Set<number>();

  asyncHooks
    .createHook({
      init(asyncId, type) {
        if (type === 'PROMISE') asyncIds.add(asyncId);
      },
      destroy(asyncId) {
        asyncIds.delete(asyncId);
      },
    })
    .enable(); // to track all pending promises

  Container.names.forEach((beanName) => {
    try {
      destroy(Object, beanName);
    } catch (err) {
      logger.error(`${err.message}\n`, err);
    }
  });

  const exit = setTimeout(process.exit, timeout);
  setInterval(() => {
    if (Container.names.length || asyncIds.size) return;
    clearTimeout(exit);
    process.exit();
  });
}

/**
 * Registers a specific instance as a bean of a given class.
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
  // Store in metadata for future lookups
  setBeanName(cls as Class<T>, beanName);
  Container.add(beanName, instance, cls);
}

/**
 * Converts a class to an IoC bean.
 * @param cls the class.
 * @returns a singleton version of the given class.
 */
export function asBean<T>(cls: Class<T>, name?: string): Class<T> {
  // Resolve bean name using metadata chain
  const beanName = name ?? cls.name;

  // Store in metadata for future lookups (survives minification)
  setBeanName(cls, beanName);

  const singleton = asSingleton(
    // @ts-ignore
    class extends cls {
      constructor(...args: any[]) {
        super(...args);
        // Use captured bean name
        Container.add(beanName, this as unknown as T, cls);
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

  // Also store on wrapper class
  setBeanName(singleton, beanName);

  return withName(withSymbol(singleton, BeanSymbol), beanName);
}

/**
 * Checks if a class is a bean type or not.
 * @param cls the class.
 */
export function isBean<T>(cls: Class<T>) {
  return hasSymbol(cls, BeanSymbol);
}

/**
 * Immediately initializes a bean when calling {@link beanOf}.
 * @param cls the class.
 */
export function autoBean<T>(cls: Class<T>): Class<T> {
  const beanClass = asBean<T>(cls);
  return withSymbol(beanClass, AutoSymbol);
}
