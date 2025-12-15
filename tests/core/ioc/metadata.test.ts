import { afterEach, describe, expect, it } from 'bun:test';
import {
  AfterInit,
  BeforeInit,
  PreDestroy,
  asBean,
  asSingleton,
  beanOf,
  beans,
  destroy,
  register,
} from '../../../src/core/ioc';

describe('Metadata Storage with Minification Simulation', () => {
  afterEach(() => {
    // Clean up all beans after each test
    Object.keys(beans()).forEach((name) => {
      try {
        destroy(Object, name);
      } catch {}
    });
  });

  describe('asBean() metadata capture', () => {
    it('captures class name at decoration time', () => {
      class TestService {}

      const BeanClass = asBean(TestService);
      new BeanClass();

      // Bean should be resolvable by class reference
      expect(beanOf(TestService)).toBeInstanceOf(TestService);
    });

    it('registers bean with captured name for string lookup', () => {
      class NamedService {}

      const BeanClass = asBean(NamedService);
      new BeanClass();

      // Bean should be resolvable by string name
      expect(beanOf('NamedService')).toBeInstanceOf(NamedService);
    });

    it('uses explicit name when provided', () => {
      class CustomService {}

      const BeanClass = asBean(CustomService, 'ExplicitName');
      new BeanClass();

      // Bean should be resolvable by explicit name
      expect(beanOf('ExplicitName')).toBeInstanceOf(CustomService);
    });

    it('resolves to same instance for class and string lookups', () => {
      class UniqueService {}

      const BeanClass = asBean(UniqueService);
      new BeanClass();

      const byClass = beanOf(UniqueService);
      const byString = beanOf('UniqueService');

      expect(byClass).toBe(byString);
    });
  });

  describe('asSingleton() metadata capture', () => {
    it('stores class name for singleton', () => {
      class SingletonTest {}

      const SingletonClass = asSingleton(SingletonTest);
      const instance1 = new SingletonClass();
      const instance2 = new SingletonClass();

      // Should return same instance
      expect(instance1).toBe(instance2);
    });
  });

  describe('beanOf() with metadata resolution', () => {
    it('resolves bean by class reference', () => {
      class ServiceByClass {}

      new (asBean(ServiceByClass))();

      expect(beanOf(ServiceByClass)).toBeInstanceOf(ServiceByClass);
    });

    it('resolves bean by string name', () => {
      class ServiceByString {}

      new (asBean(ServiceByString))();

      expect(beanOf('ServiceByString')).toBeInstanceOf(ServiceByString);
    });

    it('returns undefined with unsafe flag when bean not found', () => {
      class NotRegistered {}

      const result = beanOf(NotRegistered, true);

      expect(result).toBeUndefined();
    });

    it('throws error when bean not found without unsafe flag', () => {
      class MissingBean {}

      expect(() => beanOf(MissingBean, false)).toThrow();
    });
  });

  describe('destroy() with metadata resolution', () => {
    it('destroys bean by class reference', () => {
      class DestroyableService {}

      new (asBean(DestroyableService))();
      destroy(DestroyableService);

      expect(() => beanOf(DestroyableService)).toThrow();
    });

    it('destroys bean by string name', () => {
      class NamedDestroyable {}

      new (asBean(NamedDestroyable))();
      destroy(NamedDestroyable, 'NamedDestroyable');

      expect(() => beanOf('NamedDestroyable')).toThrow();
    });

    it('returns removal details including bean name', () => {
      class DetailedService {}

      new (asBean(DetailedService))();
      const removed = destroy(DetailedService);

      expect(removed.name).toBe('DetailedService');
      expect(removed.instance).toBeInstanceOf(DetailedService);
      expect(removed.type).toBe(DetailedService);
    });
  });

  describe('register() with metadata', () => {
    it('registers instance and stores in metadata', () => {
      class PreCreatedService {
        value = 42;
      }

      const instance = new PreCreatedService();
      register(instance, PreCreatedService);

      expect(beanOf(PreCreatedService)).toBe(instance);
      expect((beanOf(PreCreatedService) as PreCreatedService).value).toBe(42);
    });

    it('registers with explicit name', () => {
      class CustomNamed {}

      const instance = new CustomNamed();
      register(instance, CustomNamed, 'MyCustomName');

      expect(beanOf('MyCustomName') as CustomNamed).toBe(instance);
    });
  });

  describe('Multiple beans with captured names', () => {
    it('registers and retrieves multiple beans independently', () => {
      class ServiceA {
        getValue() {
          return 'A';
        }
      }

      class ServiceB {
        getValue() {
          return 'B';
        }
      }

      new (asBean(ServiceA))();
      new (asBean(ServiceB))();

      expect((beanOf(ServiceA) as ServiceA).getValue()).toBe('A');
      expect((beanOf(ServiceB) as ServiceB).getValue()).toBe('B');
      expect((beanOf('ServiceA') as ServiceA).getValue()).toBe('A');
      expect((beanOf('ServiceB') as ServiceB).getValue()).toBe('B');
    });

    it('beans remain independent after cleanup', () => {
      class Service1 {}
      class Service2 {}

      new (asBean(Service1))();
      new (asBean(Service2))();

      // Destroy one bean
      destroy(Service1);

      // Other bean should still be resolvable
      expect(beanOf(Service2)).toBeInstanceOf(Service2);

      // Destroyed bean should not be resolvable
      expect(() => beanOf(Service1)).toThrow();
    });
  });

  describe('Explicit name priority', () => {
    it('explicit name takes priority over class name', () => {
      class PriorityTest {}

      const BeanClass = asBean(PriorityTest, 'OverriddenName');
      new BeanClass();

      // Should resolve by explicit name
      expect(beanOf('OverriddenName')).toBeInstanceOf(PriorityTest);

      // Should also resolve by class reference (uses metadata internally)
      expect(beanOf(PriorityTest)).toBeInstanceOf(PriorityTest);
    });

    it('destroy with explicit name works', () => {
      class DestroyPriority {}

      new (asBean(DestroyPriority, 'Priority'))();
      destroy(DestroyPriority, 'Priority');

      expect(() => beanOf('Priority')).toThrow();
    });
  });

  describe('Backward compatibility', () => {
    it('works with non-decorated classes registered via asBean', () => {
      // Simulating class without prior decoration
      class SimpleClass {}

      const BeanClass = asBean(SimpleClass);
      new BeanClass();

      // Should work despite no prior decoration
      expect(beanOf(SimpleClass)).toBeInstanceOf(SimpleClass);
    });

    it('fallback to cls.name when no metadata', () => {
      class FallbackTest {}

      // Register with explicit name
      const BeanClass = asBean(FallbackTest, 'explicit');
      new BeanClass();

      // Should resolve by the explicit name (stored in metadata)
      expect(beanOf('explicit')).toBeInstanceOf(FallbackTest);
    });
  });

  describe('Multiple decorators on same class', () => {
    it('bean name retained with single lifecycle decorator', () => {
      class ServiceWithBeforeInit {
        initCalled = false;

        @BeforeInit
        private async initialize() {
          this.initCalled = true;
        }
      }

      const BeanClass = asBean(ServiceWithBeforeInit);
      const instance = new BeanClass();

      // Bean should be resolvable by class reference
      expect(beanOf(ServiceWithBeforeInit)).toBeInstanceOf(
        ServiceWithBeforeInit
      );

      // Bean should be resolvable by string name
      expect(beanOf('ServiceWithBeforeInit')).toBeInstanceOf(
        ServiceWithBeforeInit
      );
    });

    it('bean name retained with multiple lifecycle decorators', () => {
      class ServiceWithMultipleDecorators {
        initCalled = false;
        stopCalled = false;

        @BeforeInit
        private async initialize() {
          this.initCalled = true;
        }

        @AfterInit
        async onInit() {
          // AfterInit implementation
        }

        @PreDestroy
        async onStop() {
          this.stopCalled = true;
        }
      }

      const BeanClass = asBean(ServiceWithMultipleDecorators);
      const instance = new BeanClass();

      // Bean should be resolvable by class reference
      expect(beanOf(ServiceWithMultipleDecorators)).toBeInstanceOf(
        ServiceWithMultipleDecorators
      );

      // Bean should be resolvable by string name
      expect(beanOf('ServiceWithMultipleDecorators')).toBeInstanceOf(
        ServiceWithMultipleDecorators
      );

      // Verify instance is the correct one
      const retrieved = beanOf(ServiceWithMultipleDecorators);
      expect(retrieved).toBe(instance);
    });

    it('bean name stable when decorators applied before asBean', () => {
      class DecoratedBeforeAsBean {
        value = 'decorated';

        @BeforeInit
        private setup() {
          // Setup code
        }

        @AfterInit
        async onInit() {
          // Initialization code
        }
      }

      // Apply asBean after decorators are already applied
      const BeanClass = asBean(DecoratedBeforeAsBean);
      const instance = new BeanClass();

      // Both lookup methods should work
      expect(beanOf(DecoratedBeforeAsBean)).toBe(instance);
      expect(beanOf<DecoratedBeforeAsBean>('DecoratedBeforeAsBean')).toBe(
        instance
      );
    });

    it('explicit name takes precedence over multiple decorators', () => {
      class MultiDecoratoredService {
        @BeforeInit
        private init() {}

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      const BeanClass = asBean(MultiDecoratoredService, 'ExplicitMultiName');
      const instance = new BeanClass();

      // Should resolve by explicit name
      expect(beanOf<MultiDecoratoredService>('ExplicitMultiName')).toBe(
        instance
      );

      // Should resolve by class reference (uses metadata internally)
      expect(beanOf(MultiDecoratoredService)).toBe(instance);
    });

    it('multiple decorated services remain independent', () => {
      class ServiceA {
        name = 'A';

        @BeforeInit
        private initA() {}

        @AfterInit
        async onInitA() {}
      }

      class ServiceB {
        name = 'B';

        @BeforeInit
        private initB() {}

        @PreDestroy
        async onStopB() {}
      }

      class ServiceC {
        name = 'C';

        @AfterInit
        async onInitC() {}

        @PreDestroy
        async onStopC() {}
      }

      const BeanClassA = asBean(ServiceA);
      const BeanClassB = asBean(ServiceB);
      const BeanClassC = asBean(ServiceC);

      const instanceA = new BeanClassA();
      const instanceB = new BeanClassB();
      const instanceC = new BeanClassC();

      // Each bean should be independently resolvable
      expect(beanOf(ServiceA)).toBe(instanceA);
      expect(beanOf(ServiceB)).toBe(instanceB);
      expect(beanOf(ServiceC)).toBe(instanceC);

      // String lookups should also work
      expect(beanOf<ServiceA>('ServiceA')).toBe(instanceA);
      expect(beanOf<ServiceB>('ServiceB')).toBe(instanceB);
      expect(beanOf<ServiceC>('ServiceC')).toBe(instanceC);

      // Destroy one and verify others remain
      destroy(ServiceA);
      expect(() => beanOf(ServiceA)).toThrow();
      expect(beanOf(ServiceB)).toBe(instanceB);
      expect(beanOf(ServiceC)).toBe(instanceC);
    });

    it('metadata survives through singleton wrapping with decorators', () => {
      class DecoratedSingleton {
        timestamp = Date.now();

        @BeforeInit
        private setup() {}
      }

      const SingletonClass = asSingleton(DecoratedSingleton);
      const instance1 = new SingletonClass();
      const instance2 = new SingletonClass();

      // Singleton should return same instance
      expect(instance1).toBe(instance2);

      // Now convert to bean
      const BeanClass = asBean(DecoratedSingleton);
      const beanInstance = new BeanClass();

      // Should resolve correctly
      expect(beanOf(DecoratedSingleton)).toBe(beanInstance);
      expect(beanOf<DecoratedSingleton>('DecoratedSingleton')).toBe(
        beanInstance
      );
    });

    it('register preserves bean name with decorated classes', () => {
      class PreExistingDecorated {
        value = 42;

        @BeforeInit
        private init() {}

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      const instance = new PreExistingDecorated();
      register(instance, PreExistingDecorated);

      // Should be resolvable by class reference
      expect(beanOf(PreExistingDecorated)).toBe(instance);

      // Should be resolvable by string name
      expect(beanOf<PreExistingDecorated>('PreExistingDecorated')).toBe(
        instance
      );

      // Should have correct value
      expect((beanOf(PreExistingDecorated) as PreExistingDecorated).value).toBe(
        42
      );
    });

    it('destroy works correctly with multiply-decorated beans', () => {
      class ComplexDecorated {
        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      const BeanClass = asBean(ComplexDecorated);
      new BeanClass();

      // Verify it exists
      expect(beanOf(ComplexDecorated)).toBeInstanceOf(ComplexDecorated);

      // Destroy by class reference
      const removed = destroy(ComplexDecorated);
      expect(removed.name).toBe('ComplexDecorated');

      // Verify it's gone
      expect(() => beanOf(ComplexDecorated)).toThrow();
      expect(() => beanOf('ComplexDecorated')).toThrow();
    });

    it('bean name metadata is first-decorator-wins safe', () => {
      class FirstDecoratorWins {
        @BeforeInit
        private init() {}

        @AfterInit
        async onInit() {}
      }

      // Create bean - this sets metadata
      const BeanClass = asBean(FirstDecoratorWins, 'FirstName');
      new BeanClass();

      expect(beanOf('FirstName')).toBeInstanceOf(FirstDecoratorWins);

      // Try to register with different name - should use existing metadata
      const anotherInstance = new FirstDecoratorWins();
      register(anotherInstance, FirstDecoratorWins, 'SecondName');

      // Both names should exist with different instances
      const first = beanOf('FirstName');
      const second = beanOf('SecondName');

      expect(first).not.toBe(second);
      expect(first).toBeInstanceOf(FirstDecoratorWins);
      expect(second).toBeInstanceOf(FirstDecoratorWins);
    });

    it('complex scenario: multiple services with mixed decorators', () => {
      class DatabaseService {
        name = 'db';

        @BeforeInit
        private connectDB() {}
      }

      class CacheService {
        name = 'cache';

        @BeforeInit
        private initCache() {}

        @AfterInit
        async onInit() {}
      }

      class ApiService {
        name = 'api';

        @BeforeInit
        private setupApi() {}

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      const dbBean = new (asBean(DatabaseService))();
      const cacheBean = new (asBean(CacheService))();
      const apiBean = new (asBean(ApiService))();

      // All services should be independently resolvable
      const db = beanOf(DatabaseService);
      const cache = beanOf(CacheService);
      const api = beanOf(ApiService);

      expect(db).toBe(dbBean);
      expect(cache).toBe(cacheBean);
      expect(api).toBe(apiBean);

      // String lookups should also work
      expect(beanOf<DatabaseService>('DatabaseService')).toBe(dbBean);
      expect(beanOf<CacheService>('CacheService')).toBe(cacheBean);
      expect(beanOf<ApiService>('ApiService')).toBe(apiBean);

      // Partial destruction should work
      destroy(CacheService);

      expect(beanOf(DatabaseService)).toBe(dbBean);
      expect(() => beanOf(CacheService)).toThrow();
      expect(beanOf(ApiService)).toBe(apiBean);
    });
  });
});
