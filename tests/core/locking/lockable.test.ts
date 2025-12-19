import { describe, expect, it } from 'bun:test';
import {
  LockKey,
  LockKeyGenerator,
  LockTimeoutError,
  Lockable,
  SimpleLock,
  SimpleLockKeyGenerator,
} from '../../../src/core/locking';

describe('Lockable Decorator', () => {
  describe('LockKey', () => {
    it('generates key value from generator function', () => {
      const generator: LockKeyGenerator = (...args) => args.join(':');
      const lockKey = new LockKey(generator, ['a', 'b', 'c']);

      expect(lockKey.value).toBe('a:b:c');
      expect(lockKey.args).toEqual(['a', 'b', 'c']);
    });

    it('preserves original arguments', () => {
      const generator: LockKeyGenerator = () => 'static-key';
      const args = ['arg1', 123, { nested: true }];
      const lockKey = new LockKey(generator, args);

      expect(lockKey.args).toEqual(args);
      expect(lockKey.value).toBe('static-key');
    });
  });

  describe('SimpleLockKeyGenerator', () => {
    it('generates key from class and method name', () => {
      const key = SimpleLockKeyGenerator('MyClass', 'myMethod');
      expect(key).toBe('MyClass:myMethod');
    });

    it('includes JSON stringified args when present', () => {
      const key = SimpleLockKeyGenerator('MyClass', 'myMethod', 'arg1', 123);
      expect(key).toBe('MyClass:myMethod:["arg1",123]');
    });

    it('handles complex object arguments', () => {
      const key = SimpleLockKeyGenerator('Service', 'process', {
        id: 1,
        name: 'test',
      });
      expect(key).toBe('Service:process:[{"id":1,"name":"test"}]');
    });

    it('handles no extra arguments', () => {
      const key = SimpleLockKeyGenerator('Controller', 'handle');
      expect(key).toBe('Controller:handle');
    });
  });

  describe('LockTimeoutError', () => {
    it('creates error with correct message', () => {
      const error = new LockTimeoutError('test:key', 5000);
      expect(error.message).toBe(
        'Lock acquisition timed out for key "test:key" after 5000ms'
      );
      expect(error.name).toBe('LockTimeoutError');
    });

    it('is instance of Error', () => {
      const error = new LockTimeoutError('key', 1000);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Lockable decorator', () => {
    it('executes method with lock acquired', async () => {
      const lock = new SimpleLock();
      let executed = false;

      class TestService {
        @Lockable({ lock })
        async process() {
          executed = true;
          return 'result';
        }
      }

      const service = new TestService();
      const result = await service.process();

      expect(executed).toBe(true);
      expect(result).toBe('result');
    });

    it('releases lock after method execution', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({ lock })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      // Lock should be released, so another lock should succeed
      const canAcquire = await lock.lock('TestService:process');
      expect(canAcquire).toBe(true);
      await lock.unlock('TestService:process');
    });

    it('releases lock even on error', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({ lock })
        async failingMethod() {
          throw new Error('Method failed');
        }
      }

      const service = new TestService();

      await expect(service.failingMethod()).rejects.toThrow('Method failed');

      // Lock should still be released
      const canAcquire = await lock.lock('TestService:failingMethod');
      expect(canAcquire).toBe(true);
    });

    it('uses SimpleLock by default when no lock provided', async () => {
      let executed = false;

      class TestService {
        @Lockable()
        async defaultLock() {
          executed = true;
          return 'ok';
        }
      }

      const service = new TestService();
      const result = await service.defaultLock();

      expect(executed).toBe(true);
      expect(result).toBe('ok');
    });

    it('passes method arguments correctly', async () => {
      const lock = new SimpleLock();
      let receivedArgs: any[] = [];

      class TestService {
        @Lockable({ lock })
        async processWithArgs(a: string, b: number, c: object) {
          receivedArgs = [a, b, c];
          return { a, b, c };
        }
      }

      const service = new TestService();
      const result = await service.processWithArgs('hello', 42, {
        key: 'value',
      });

      expect(receivedArgs).toEqual(['hello', 42, { key: 'value' }]);
      expect(result).toEqual({ a: 'hello', b: 42, c: { key: 'value' } });
    });

    it('preserves this context', async () => {
      const lock = new SimpleLock();

      class TestService {
        private value = 'instance-value';

        @Lockable({ lock })
        async getValue() {
          return this.value;
        }
      }

      const service = new TestService();
      const result = await service.getValue();

      expect(result).toBe('instance-value');
    });

    it('handles synchronous return values', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({ lock })
        syncMethod() {
          return 'sync-result';
        }
      }

      const service = new TestService();
      const result = await service.syncMethod();

      expect(result).toBe('sync-result');
    });
  });

  describe('Lockable with custom key', () => {
    it('uses static string key', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({ lock, key: 'custom-static-key' })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      // Check that the custom key was used
      const isLocked = await lock.locked('custom-static-key');
      expect(isLocked).toBe(false); // Should be released after method
    });

    it('uses custom key generator', async () => {
      const lock = new SimpleLock();
      let generatedKey = '';

      const customGenerator: LockKeyGenerator = (
        className,
        methodName,
        ...args
      ) => {
        generatedKey = `custom:${className}:${methodName}:${args[0]}`;
        return generatedKey;
      };

      class TestService {
        @Lockable({ lock, key: customGenerator })
        async processItem(itemId: string) {
          return itemId;
        }
      }

      const service = new TestService();
      await service.processItem('item-123');

      expect(generatedKey).toBe('custom:TestService:processItem:item-123');
    });

    it('generates different keys for different arguments', async () => {
      const lock = new SimpleLock();
      const keys: string[] = [];

      const trackingGenerator: LockKeyGenerator = (...args) => {
        const key = args.join(':');
        keys.push(key);
        return key;
      };

      class TestService {
        @Lockable({ lock, key: trackingGenerator })
        async process(id: string) {
          return id;
        }
      }

      const service = new TestService();
      await service.process('a');
      await service.process('b');
      await service.process('c');

      expect(keys.length).toBe(3);
      expect(keys[0]).toContain('a');
      expect(keys[1]).toContain('b');
      expect(keys[2]).toContain('c');
    });
  });

  describe('Lockable with options', () => {
    it('passes timeout option to lock', async () => {
      const lock = new SimpleLock();

      // First lock the key
      await lock.lock('TestService:slowMethod');

      class TestService {
        @Lockable({
          lock,
          options: { timeout: 100 },
        })
        async slowMethod() {
          return 'done';
        }
      }

      const service = new TestService();

      // Should timeout because lock is held
      await expect(service.slowMethod()).rejects.toThrow(LockTimeoutError);

      await lock.unlock('TestService:slowMethod');
    });

    it('passes options from function', async () => {
      const lock = new SimpleLock();
      let optionsCalled = false;

      class TestService {
        @Lockable({
          lock,
          options: () => {
            optionsCalled = true;
            return { timeout: 1000 };
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      expect(optionsCalled).toBe(true);
    });

    it('uses auth option for lock ownership', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({
          lock,
          options: { auth: 'service-owner' },
        })
        async process() {
          // During execution, lock should be owned by 'service-owner'
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      // Lock should be released with correct auth
      const canAcquire = await lock.lock('TestService:process');
      expect(canAcquire).toBe(true);
    });
  });

  describe('Lockable events', () => {
    it('calls onAcquired when lock is acquired', async () => {
      const lock = new SimpleLock();
      let acquiredKey: LockKey | null = null;

      class TestService {
        @Lockable({
          lock,
          events: {
            onAcquired: (key) => {
              acquiredKey = key;
            },
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      expect(acquiredKey).not.toBeNull();
      expect(acquiredKey!.value).toBe('TestService:process');
    });

    it('calls onReleased when lock is released', async () => {
      const lock = new SimpleLock();
      let releasedKey: LockKey | null = null;

      class TestService {
        @Lockable({
          lock,
          events: {
            onReleased: (key) => {
              releasedKey = key;
            },
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      expect(releasedKey).not.toBeNull();
      expect(releasedKey!.value).toBe('TestService:process');
    });

    it('calls onTimeout when lock acquisition fails', async () => {
      const lock = new SimpleLock();
      let timeoutKey: LockKey | null = null;
      let timeoutValue = 0;

      // Pre-acquire lock
      await lock.lock('TestService:process');

      class TestService {
        @Lockable({
          lock,
          options: { timeout: 50 },
          events: {
            onTimeout: (key, timeout) => {
              timeoutKey = key;
              timeoutValue = timeout;
            },
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();

      try {
        await service.process();
      } catch {
        // Expected to throw
      }

      expect(timeoutKey).not.toBeNull();
      expect(timeoutKey!.value).toBe('TestService:process');
      expect(timeoutValue).toBe(50);

      await lock.unlock('TestService:process');
    });

    it('calls onReleased even on method error', async () => {
      const lock = new SimpleLock();
      let released = false;

      class TestService {
        @Lockable({
          lock,
          events: {
            onReleased: () => {
              released = true;
            },
          },
        })
        async failingProcess() {
          throw new Error('Intentional failure');
        }
      }

      const service = new TestService();

      try {
        await service.failingProcess();
      } catch {
        // Expected
      }

      expect(released).toBe(true);
    });
  });

  describe('Lockable with lock supplier', () => {
    it('accepts lock instance', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({ lock })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      const result = await service.process();
      expect(result).toBe('done');
    });

    it('accepts lock supplier function', async () => {
      const lock = new SimpleLock();
      let supplierCalled = false;

      class TestService {
        @Lockable({
          lock: () => {
            supplierCalled = true;
            return lock;
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();

      expect(supplierCalled).toBe(true);
    });

    it('accepts async lock supplier', async () => {
      const lock = new SimpleLock();

      class TestService {
        @Lockable({
          lock: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return lock;
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      const result = await service.process();
      expect(result).toBe('done');
    });

    it('caches lock instance from supplier', async () => {
      const lock = new SimpleLock();
      let callCount = 0;

      class TestService {
        @Lockable({
          lock: () => {
            callCount++;
            return lock;
          },
        })
        async process() {
          return 'done';
        }
      }

      const service = new TestService();
      await service.process();
      await service.process();
      await service.process();

      // Supplier should only be called once due to caching
      expect(callCount).toBe(1);
    });
  });

  describe('Lockable concurrent execution', () => {
    it('serializes concurrent calls to same method', async () => {
      const lock = new SimpleLock();
      const executionOrder: number[] = [];
      let counter = 0;

      class TestService {
        @Lockable({ lock, options: { timeout: 1000 } })
        async process() {
          const myOrder = ++counter;
          await new Promise((r) => setTimeout(r, 50));
          executionOrder.push(myOrder);
          return myOrder;
        }
      }

      const service = new TestService();

      // Start 3 concurrent calls
      const results = await Promise.all([
        service.process(),
        service.process(),
        service.process(),
      ]);

      // All should complete in order
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('allows concurrent execution on different keys', async () => {
      const lock = new SimpleLock();
      const executing = new Set<string>();
      let maxConcurrent = 0;

      class TestService {
        @Lockable({
          lock,
          key: (className, methodName, id: string) =>
            `${className}:${methodName}:${id}`,
        })
        async processItem(id: string) {
          executing.add(id);
          maxConcurrent = Math.max(maxConcurrent, executing.size);
          await new Promise((r) => setTimeout(r, 50));
          executing.delete(id);
          return id;
        }
      }

      const service = new TestService();

      // Start concurrent calls with different IDs
      const results = await Promise.all([
        service.processItem('a'),
        service.processItem('b'),
        service.processItem('c'),
      ]);

      // All should run concurrently since keys are different
      expect(maxConcurrent).toBe(3);
      expect(results).toEqual(['a', 'b', 'c']);
    });
  });
});
