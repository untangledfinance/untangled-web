import { afterEach, describe, expect, it } from 'bun:test';
import {
  createLockDecorator,
  createRequestLockDecorator,
} from '../../../src/boot/decorators/lock';
import { asBean, destroy } from '../../../src/core/ioc';
import { LockTimeoutError, SimpleLock } from '../../../src/core/locking';
import { Configurations } from '../../../src/types';

// Mock configurations
const mockConfigs = (): Configurations =>
  ({
    app: {
      name: 'test-app',
      version: '1.0.0',
    },
    lock: {
      type: 'simple',
    },
  }) as Configurations;

describe('createLockDecorator', () => {
  afterEach(() => {
    // Clean up beans after each test
    try {
      destroy(Object, 'Lock');
    } catch {}
  });

  describe('Basic functionality', () => {
    it('creates a decorator factory', () => {
      const LockDecorator = createLockDecorator(mockConfigs);
      expect(typeof LockDecorator).toBe('function');
    });

    it('decorator factory returns a method decorator', () => {
      const LockDecorator = createLockDecorator(mockConfigs);
      const decorator = LockDecorator();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('With registered lock bean', () => {
    it('uses lock bean from IoC container', async () => {
      // Register a SimpleLock as bean with name 'Lock'
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const LockDecorator = createLockDecorator(mockConfigs);

      class TestService {
        @LockDecorator()
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      const result = await service.process();
      expect(result).toBe('done');
    });

    it('accepts timeout parameter', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      const bean = new BeanClass();

      // Pre-lock to test timeout
      await bean.lock('TestService:process');

      const LockDecorator = createLockDecorator(mockConfigs);

      class TestService {
        @LockDecorator(50) // 50ms timeout
        async process() {
          return 'done';
        }
      }

      const service = new TestService();

      await expect(service.process()).rejects.toThrow(LockTimeoutError);

      await bean.unlock('TestService:process');
    });

    it('accepts ttl parameter', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const LockDecorator = createLockDecorator(mockConfigs);

      class TestService {
        @LockDecorator(1000, 30000) // timeout: 1s, ttl: 30s
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      const result = await service.process();
      expect(result).toBe('done');
    });

    it('accepts custom key generator', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      let generatedKey = '';
      const customKey = (className: string, methodName: string, id: string) => {
        generatedKey = `custom:${id}`;
        return generatedKey;
      };

      const LockDecorator = createLockDecorator(mockConfigs);

      class TestService {
        @LockDecorator(1000, 30000, customKey)
        async processItem(id: string) {
          return id;
        }
      }

      const service = new TestService();
      await service.processItem('item-123');

      expect(generatedKey).toBe('custom:item-123');
    });

    it('accepts event handlers', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      let acquired = false;
      let released = false;

      const LockDecorator = createLockDecorator(mockConfigs);

      class TestService {
        @LockDecorator(1000, 30000, undefined, {
          onAcquired: () => {
            acquired = true;
          },
          onReleased: () => {
            released = true;
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      expect(acquired).toBe(true);
      expect(released).toBe(true);
    });
  });

  describe('Concurrent execution', () => {
    it('serializes calls with same lock', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const LockDecorator = createLockDecorator(mockConfigs);
      const order: number[] = [];
      let counter = 0;

      class TestService {
        @LockDecorator(500) // 500ms timeout for waiting
        async process() {
          const n = ++counter;
          await new Promise((r) => setTimeout(r, 30));
          order.push(n);
          return n;
        }
      }

      const service = new TestService();
      const results = await Promise.all([
        service.process(),
        service.process(),
        service.process(),
      ]);

      expect(order).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
    });
  });
});

describe('createRequestLockDecorator', () => {
  afterEach(() => {
    try {
      destroy(Object, 'Lock');
    } catch {}
  });

  describe('Basic functionality', () => {
    it('creates a decorator factory', () => {
      const ReqLock = createRequestLockDecorator(mockConfigs);
      expect(typeof ReqLock).toBe('function');
    });

    it('uses request path in lock key', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const ReqLock = createRequestLockDecorator(mockConfigs);

      class TestController {
        @ReqLock(1000, 30000)
        async handleRequest(req: { path: string }) {
          return req.path;
        }
      }

      const controller = new TestController();
      const result = await controller.handleRequest({ path: '/api/test' });
      expect(result).toBe('/api/test');
    });

    it('accepts timeout and ttl parameters', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const ReqLock = createRequestLockDecorator(mockConfigs);

      class TestController {
        @ReqLock(500, 10000) // timeout: 500ms, ttl: 10s
        async handle(req: { path: string }) {
          return 'handled';
        }
      }

      const controller = new TestController();
      const result = await controller.handle({ path: '/test' });
      expect(result).toBe('handled');
    });
  });

  describe('Request-based key generation', () => {
    it('generates different keys for different paths', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const ReqLock = createRequestLockDecorator(mockConfigs);
      const executing = new Set<string>();
      let maxConcurrent = 0;

      class TestController {
        @ReqLock(1000)
        async handle(req: { path: string }) {
          executing.add(req.path);
          maxConcurrent = Math.max(maxConcurrent, executing.size);
          await new Promise((r) => setTimeout(r, 30));
          executing.delete(req.path);
          return req.path;
        }
      }

      const controller = new TestController();

      // Concurrent requests to different paths should run in parallel
      const results = await Promise.all([
        controller.handle({ path: '/path1' }),
        controller.handle({ path: '/path2' }),
        controller.handle({ path: '/path3' }),
      ]);

      expect(maxConcurrent).toBe(3);
      expect(results).toEqual(['/path1', '/path2', '/path3']);
    });

    it('serializes requests to same path', async () => {
      const BeanClass = asBean(class extends SimpleLock {}, 'Lock');
      new BeanClass();

      const ReqLock = createRequestLockDecorator(mockConfigs);
      const order: number[] = [];
      let counter = 0;

      class TestController {
        @ReqLock(500)
        async handle(req: { path: string }) {
          const n = ++counter;
          await new Promise((r) => setTimeout(r, 20));
          order.push(n);
          return n;
        }
      }

      const controller = new TestController();

      // Same path should be serialized
      const results = await Promise.all([
        controller.handle({ path: '/same' }),
        controller.handle({ path: '/same' }),
        controller.handle({ path: '/same' }),
      ]);

      expect(order).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
    });
  });
});
