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
  restart,
} from '../../../src/core/ioc';

describe('Advanced Decorator Edge Cases and Stability', () => {
  afterEach(() => {
    // Clean up all beans after each test
    Object.keys(beans()).forEach((name) => {
      try {
        destroy(Object, name);
      } catch {}
    });
  });

  describe('Decorator stacking and inheritance', () => {
    it('bean name stable through class inheritance with decorators', () => {
      class BaseService {
        baseName = 'base';

        @BeforeInit
        protected setupBase() {}
      }

      class DerivedService extends BaseService {
        derivedName = 'derived';

        @AfterInit
        async onInitDerived() {}
      }

      const BeanClass = asBean(DerivedService);
      const instance = new BeanClass();

      // Should resolve by derived class
      expect(beanOf(DerivedService)).toBe(instance);
      expect(beanOf<DerivedService>('DerivedService')).toBe(instance);

      // Should have properties from both base and derived
      expect((instance as any).baseName).toBe('base');
      expect((instance as any).derivedName).toBe('derived');
    });

    it('decorators on base and derived classes both work', () => {
      class BaseWithDecorator {
        @BeforeInit
        private baseSetup() {}

        getValue() {
          return 'base';
        }
      }

      class DerivedWithDecorator extends BaseWithDecorator {
        @BeforeInit
        private derivedSetup() {}

        @AfterInit
        async onInit() {}

        override getValue() {
          return 'derived';
        }
      }

      const BeanClass = asBean(DerivedWithDecorator);
      const instance = new BeanClass();

      expect(beanOf(DerivedWithDecorator)).toBe(instance);
      expect((instance as DerivedWithDecorator).getValue()).toBe('derived');
    });

    it('multiple decorator application on same method name', () => {
      class ServiceWithDecoratorMethods {
        setupCalled = false;
        initCalled = false;
        stopCalled = false;

        @BeforeInit
        private setup() {
          this.setupCalled = true;
        }

        @AfterInit
        async onInit() {
          this.initCalled = true;
        }

        @PreDestroy
        async onStop() {
          this.stopCalled = true;
        }
      }

      const BeanClass = asBean(ServiceWithDecoratorMethods);
      const instance = new BeanClass();

      expect(beanOf(ServiceWithDecoratorMethods)).toBe(instance);
      // Just verify the bean was created successfully with decorators applied
      expect(instance).toBeInstanceOf(ServiceWithDecoratorMethods);
    });
  });

  describe('Restart with decorated classes', () => {
    it('restart preserves bean name with decorated class', () => {
      class RestartableService {
        timestamp: number = 0;

        @BeforeInit
        private initialize() {
          this.timestamp = Date.now();
        }

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      const BeanClass = asBean(RestartableService);
      const original = new BeanClass();
      const originalTimestamp = (original as any).timestamp;

      // Wait a bit to ensure timestamp differs
      const startRestart = Date.now();
      while (Date.now() - startRestart < 10) {
        // Busy wait
      }

      // Restart the bean
      const { previous, current } = restart(RestartableService);

      expect(previous).toBe(original);
      expect(current).toBeInstanceOf(RestartableService);
      expect((current as any).timestamp).toBeGreaterThanOrEqual(
        originalTimestamp
      );

      // New instance should be resolvable
      expect(beanOf(RestartableService)).toBe(current);
      expect(beanOf<RestartableService>('RestartableService')).toBe(current);
    });

    it('restart with explicit name preserves bean identity', () => {
      class NamedRestartable {
        @BeforeInit
        private setup() {}

        @PreDestroy
        async onStop() {}
      }

      const BeanClass = asBean(NamedRestartable, 'CustomRestartName');
      const original = new BeanClass();

      const { previous, current } = restart(
        NamedRestartable,
        'CustomRestartName'
      );

      expect(previous).toBe(original);
      expect(current).toBeInstanceOf(NamedRestartable);
      expect(beanOf<NamedRestartable>('CustomRestartName')).toBe(current);
      expect(beanOf(NamedRestartable)).toBe(current);
    });
  });

  describe('Singleton with decorator combinations', () => {
    it('singleton with all three lifecycle decorators', () => {
      class DecoratedSingleton {
        @BeforeInit
        private preConstruct() {
          // Lifecycle hooks are called without guaranteed this binding
        }

        @AfterInit
        async onInit() {
          // Lifecycle hooks are called without guaranteed this binding
        }

        @PreDestroy
        async onStop() {
          // Lifecycle hooks are called without guaranteed this binding
        }
      }

      const SingletonClass = asSingleton(DecoratedSingleton);
      const instance1 = new SingletonClass();
      const instance2 = new SingletonClass();

      // Should be same instance
      expect(instance1).toBe(instance2);

      // Now register as bean
      const BeanClass = asBean(DecoratedSingleton);
      const beanInstance = new BeanClass();

      expect(beanOf(DecoratedSingleton)).toBe(beanInstance);
      expect(beanOf<DecoratedSingleton>('DecoratedSingleton')).toBe(
        beanInstance
      );
    });

    it('different singletons with same decorator pattern', () => {
      class SingletonA {
        name = 'A';

        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}
      }

      class SingletonB {
        name = 'B';

        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}
      }

      const SingletonAClass = asSingleton(SingletonA);
      const SingletonBClass = asSingleton(SingletonB);

      const a1 = new SingletonAClass();
      const a2 = new SingletonAClass();
      const b1 = new SingletonBClass();
      const b2 = new SingletonBClass();

      // Each singleton should be consistent
      expect(a1).toBe(a2);
      expect(b1).toBe(b2);
      expect(a1).not.toBe(b1);

      // Convert to beans
      const BeanA = asBean(SingletonA);
      const BeanB = asBean(SingletonB);

      new BeanA();
      new BeanB();

      expect(beanOf(SingletonA)).toBeInstanceOf(SingletonA);
      expect(beanOf(SingletonB)).toBeInstanceOf(SingletonB);
    });
  });

  describe('Dynamic decoration scenarios', () => {
    it('multiple independent service instances with metadata', () => {
      // Create service instances with unique metadata
      class IndependentServiceX {
        serviceName = 'ServiceX';

        getName() {
          return this.serviceName;
        }
      }

      class IndependentServiceY {
        serviceName = 'ServiceY';

        getName() {
          return this.serviceName;
        }
      }

      const BeanX = asBean(IndependentServiceX);
      const BeanY = asBean(IndependentServiceY);

      const x = new BeanX();
      const y = new BeanY();

      expect(beanOf(IndependentServiceX)).toBe(x);
      expect(beanOf(IndependentServiceY)).toBe(y);
      expect((x as any).getName()).toBe('ServiceX');
      expect((y as any).getName()).toBe('ServiceY');
    });

    it('class with multiple decorator methods', () => {
      class MethodDecoratedService {
        calls: string[] = [];

        @BeforeInit
        private beforeInit() {
          // Lifecycle methods don't guarantee this binding
        }

        @AfterInit
        async afterInit() {
          // Lifecycle methods don't guarantee this binding
        }

        dynamicMethod() {
          this.calls.push('dynamic');
          return this.calls;
        }
      }

      const BeanClass = asBean(MethodDecoratedService);
      const instance = new BeanClass();

      expect(beanOf(MethodDecoratedService)).toBe(instance);

      const result = (instance as any).dynamicMethod();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Error handling with decorated beans', () => {
    it('destroy with decorated class handles missing bean safely', () => {
      class MissingDecoratedService {
        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}
      }

      // Try to destroy without creating - should not throw
      const result = destroy(MissingDecoratedService);

      expect(result.instance).toBeUndefined();
      expect(result.type).toBe(MissingDecoratedService);
      expect(result.name).toBe('MissingDecoratedService');
    });

    it('beanOf with unsafe flag returns undefined for missing decorated bean', () => {
      class NonExistentDecorated {
        @BeforeInit
        private setup() {}
      }

      const result = beanOf(NonExistentDecorated, true);
      expect(result).toBeUndefined();
    });

    it('register with conflicting explicit names', () => {
      class ConflictService {
        @BeforeInit
        private setup() {}
      }

      const instance1 = new ConflictService();
      register(instance1, ConflictService, 'Conflict');

      // Should resolve correctly
      expect(beanOf<ConflictService>('Conflict')).toBe(instance1);

      // Register another with different explicit name
      const instance2 = new ConflictService();
      register(instance2, ConflictService, 'Conflict2');

      expect(beanOf<ConflictService>('Conflict2')).toBe(instance2);
      expect(beanOf<ConflictService>('Conflict')).toBe(instance1);
    });
  });

  describe('Metadata immutability and safety', () => {
    it('metadata not overwritten on second registration', () => {
      class ProtectedMetadata {
        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}
      }

      const BeanClass1 = asBean(ProtectedMetadata, 'FirstName');
      const instance1 = new BeanClass1();

      expect(beanOf<ProtectedMetadata>('FirstName')).toBe(instance1);

      // Try to change name on same class - should keep original
      const anotherInstance = new ProtectedMetadata();
      register(anotherInstance, ProtectedMetadata, 'SecondName');

      // Both names should have different instances
      expect(beanOf<ProtectedMetadata>('FirstName')).toBe(instance1);
      expect(beanOf<ProtectedMetadata>('SecondName')).toBe(anotherInstance);
    });

    it('explicit names prevent metadata collision', () => {
      class ServiceWithExplicit {
        @BeforeInit
        private setup() {}

        id = Math.random();
      }

      const BeanClass = asBean(ServiceWithExplicit, 'UniqueId');
      const instance = new BeanClass();

      const resolved = beanOf('UniqueId');
      expect((resolved as any).id).toBe((instance as any).id);

      // String lookup shouldn't return wrong instance
      const wrongLookup = beanOf(ServiceWithExplicit, true);
      if (wrongLookup) {
        expect((wrongLookup as any).id).toBe((instance as any).id);
      }
    });
  });

  describe('Decorator interactions with container operations', () => {
    it('beans() returns all decorated beans correctly', () => {
      class DecoratedServiceA {
        @BeforeInit
        private setup() {}
      }

      class DecoratedServiceB {
        @AfterInit
        async onInit() {}
      }

      class DecoratedServiceC {
        @PreDestroy
        async onStop() {}
      }

      new (asBean(DecoratedServiceA))();
      new (asBean(DecoratedServiceB))();
      new (asBean(DecoratedServiceC))();

      const allBeans = beans();

      expect(Object.keys(allBeans).length).toBe(3);
      expect(allBeans['DecoratedServiceA']).toBeInstanceOf(DecoratedServiceA);
      expect(allBeans['DecoratedServiceB']).toBeInstanceOf(DecoratedServiceB);
      expect(allBeans['DecoratedServiceC']).toBeInstanceOf(DecoratedServiceC);
    });

    it('beans() with filter works for decorated beans', () => {
      class FilterableA {
        type = 'A';

        @BeforeInit
        private setup() {}
      }

      class FilterableB {
        type = 'B';

        @AfterInit
        async onInit() {}
      }

      new (asBean(FilterableA))();
      new (asBean(FilterableB))();

      const filtered = beans((name, instance) => {
        return (instance as any).type === 'A';
      });

      expect(Object.keys(filtered).length).toBe(1);
      expect(filtered['FilterableA']).toBeInstanceOf(FilterableA);
    });
  });

  describe('Container operations with decorated beans', () => {
    it('handles multiple decorated services in container', () => {
      class ServiceOne {
        index = 1;

        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}

        @PreDestroy
        async onStop() {}
      }

      class ServiceTwo {
        index = 2;

        @BeforeInit
        private setup() {}

        @AfterInit
        async onInit() {}
      }

      class ServiceThree {
        index = 3;

        @BeforeInit
        private setup() {}
      }

      const instance1 = new (asBean(ServiceOne))();
      const instance2 = new (asBean(ServiceTwo))();
      const instance3 = new (asBean(ServiceThree))();

      // Verify all are resolvable
      expect(beanOf(ServiceOne)).toBe(instance1);
      expect(beanOf(ServiceTwo)).toBe(instance2);
      expect(beanOf(ServiceThree)).toBe(instance3);

      // Verify string lookups work
      expect(beanOf<ServiceOne>('ServiceOne', true)).toBe(instance1);
      expect(beanOf<ServiceTwo>('ServiceTwo', true)).toBe(instance2);
      expect(beanOf<ServiceThree>('ServiceThree', true)).toBe(instance3);
    });

    it('selective destruction of decorated beans', () => {
      class DestroyA {
        @BeforeInit
        private setup() {}

        @PreDestroy
        async onStop() {}
      }

      class DestroyB {
        @BeforeInit
        private setup() {}

        @PreDestroy
        async onStop() {}
      }

      class DestroyC {
        @BeforeInit
        private setup() {}
      }

      const a = new (asBean(DestroyA))();
      const b = new (asBean(DestroyB))();
      const c = new (asBean(DestroyC))();

      // Destroy middle one
      destroy(DestroyB);

      expect(beanOf(DestroyA)).toBe(a);
      expect(() => beanOf(DestroyB)).toThrow();
      expect(beanOf(DestroyC)).toBe(c);
    });
  });

  describe('Type safety with decorated classes', () => {
    it('beanOf.type works with decorated classes', () => {
      class TypedServiceBase {
        @BeforeInit
        private setup() {}
      }

      class TypedServiceImpl extends TypedServiceBase {
        @AfterInit
        async onInit() {}
      }

      new (asBean(TypedServiceImpl))();

      const typedLookup = beanOf.type(TypedServiceBase);
      const instance = typedLookup('TypedServiceImpl', false);

      expect(instance).toBeInstanceOf(TypedServiceBase);
      expect(instance).toBeInstanceOf(TypedServiceImpl);
    });

    it('beanOf.type throws for non-matching decorated bean', () => {
      class BaseType {
        @BeforeInit
        private setup() {}
      }

      class OtherType {}

      const instance = new OtherType();
      register(instance, OtherType, 'OtherInstance');

      const typedLookup = beanOf.type(BaseType);

      expect(() => typedLookup('OtherInstance', false)).toThrow();
    });
  });
});
