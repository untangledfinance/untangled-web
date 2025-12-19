import { afterEach, describe, expect, it } from 'bun:test';
import {
  Lock,
  LockOptions,
  SimpleLock,
  UnlockOptions,
} from '../../../src/core/locking';

describe('Lock', () => {
  describe('Lock base class', () => {
    it('throws notImplementedYet for lock()', async () => {
      const lock = new Lock();
      await expect(lock.lock('key')).rejects.toThrow();
    });

    it('throws notImplementedYet for unlock()', async () => {
      const lock = new Lock();
      await expect(lock.unlock('key')).rejects.toThrow();
    });

    it('throws notImplementedYet for locked()', async () => {
      const lock = new Lock();
      await expect(lock.locked('key')).rejects.toThrow();
    });

    it('is callable and delegates to lock()', async () => {
      class TestLock extends Lock {
        override async lock(key: string) {
          return key === 'valid';
        }
      }

      const lock = new TestLock();
      // Lock is Callable, so it can be called directly
      expect(await lock('valid')).toBe(true);
      expect(await lock('invalid')).toBe(false);
    });
  });

  describe('SimpleLock', () => {
    let lock: SimpleLock;

    afterEach(async () => {
      await lock?.onStop();
    });

    describe('Basic locking', () => {
      it('acquires lock on unlocked key', async () => {
        lock = new SimpleLock();
        const result = await lock.lock('key1');
        expect(result).toBe(true);
      });

      it('fails to acquire lock on already locked key', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        const result = await lock.lock('key1');
        expect(result).toBe(false);
      });

      it('acquires locks on different keys independently', async () => {
        lock = new SimpleLock();
        expect(await lock.lock('key1')).toBe(true);
        expect(await lock.lock('key2')).toBe(true);
        expect(await lock.lock('key3')).toBe(true);
      });

      it('releases lock correctly', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        const result = await lock.unlock('key1');
        expect(result).toBe(true);
      });

      it('fails to release non-existent lock', async () => {
        lock = new SimpleLock();
        const result = await lock.unlock('nonexistent');
        expect(result).toBe(false);
      });

      it('allows re-acquisition after unlock', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        await lock.unlock('key1');
        const result = await lock.lock('key1');
        expect(result).toBe(true);
      });
    });

    describe('locked() status check', () => {
      it('returns false for unlocked key', async () => {
        lock = new SimpleLock();
        expect(await lock.locked('key1')).toBe(false);
      });

      it('returns true for locked key', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        expect(await lock.locked('key1')).toBe(true);
      });

      it('returns false after unlock', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        await lock.unlock('key1');
        expect(await lock.locked('key1')).toBe(false);
      });
    });

    describe('Author-based unlock', () => {
      it('allows unlock without auth when lock has no author', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        const result = await lock.unlock('key1');
        expect(result).toBe(true);
      });

      it('allows unlock with any auth when lock has no author', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        const result = await lock.unlock('key1', { auth: 'anyone' });
        expect(result).toBe(true);
      });

      it('allows unlock with matching auth', async () => {
        lock = new SimpleLock();
        await lock.lock('key1', { auth: 'user-123' });
        const result = await lock.unlock('key1', { auth: 'user-123' });
        expect(result).toBe(true);
      });

      it('denies unlock with non-matching auth', async () => {
        lock = new SimpleLock();
        await lock.lock('key1', { auth: 'user-123' });
        const result = await lock.unlock('key1', { auth: 'user-456' });
        expect(result).toBe(false);
        // Lock should still be held
        expect(await lock.locked('key1')).toBe(true);
      });

      it('denies unlock without auth when lock has author', async () => {
        lock = new SimpleLock();
        await lock.lock('key1', { auth: 'user-123' });
        const result = await lock.unlock('key1');
        expect(result).toBe(false);
        // Lock should still be held
        expect(await lock.locked('key1')).toBe(true);
      });

      it('different authors can lock different keys', async () => {
        lock = new SimpleLock();
        expect(await lock.lock('key1', { auth: 'user-A' })).toBe(true);
        expect(await lock.lock('key2', { auth: 'user-B' })).toBe(true);

        // Each can only unlock their own
        expect(await lock.unlock('key1', { auth: 'user-B' })).toBe(false);
        expect(await lock.unlock('key2', { auth: 'user-A' })).toBe(false);
        expect(await lock.unlock('key1', { auth: 'user-A' })).toBe(true);
        expect(await lock.unlock('key2', { auth: 'user-B' })).toBe(true);
      });
    });

    describe('Wait with timeout', () => {
      it('returns immediately without timeout when lock unavailable', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');

        const start = Date.now();
        const result = await lock.lock('key1');
        const elapsed = Date.now() - start;

        expect(result).toBe(false);
        expect(elapsed).toBeLessThan(50); // Should be nearly instant
      });

      it('waits and acquires lock when released within timeout', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');

        // Release lock after 100ms
        setTimeout(async () => {
          await lock.unlock('key1');
        }, 100);

        const start = Date.now();
        const result = await lock.lock('key1', { timeout: 500 });
        const elapsed = Date.now() - start;

        expect(result).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(90);
        expect(elapsed).toBeLessThan(500);
      });

      it('times out when lock not released', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');

        const start = Date.now();
        const result = await lock.lock('key1', { timeout: 150 });
        const elapsed = Date.now() - start;

        expect(result).toBe(false);
        expect(elapsed).toBeGreaterThanOrEqual(140);
        expect(elapsed).toBeLessThan(300);
      });

      it('timeout of 0 returns immediately', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');

        const start = Date.now();
        const result = await lock.lock('key1', { timeout: 0 });
        const elapsed = Date.now() - start;

        expect(result).toBe(false);
        expect(elapsed).toBeLessThan(50);
      });

      it('negative timeout returns immediately', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');

        const start = Date.now();
        const result = await lock.lock('key1', { timeout: -100 });
        const elapsed = Date.now() - start;

        expect(result).toBe(false);
        expect(elapsed).toBeLessThan(50);
      });

      it('acquires lock immediately if available even with timeout', async () => {
        lock = new SimpleLock();

        const start = Date.now();
        const result = await lock.lock('key1', { timeout: 1000 });
        const elapsed = Date.now() - start;

        expect(result).toBe(true);
        expect(elapsed).toBeLessThan(50);
      });
    });

    describe('Concurrent access', () => {
      it('only one of concurrent requests acquires the lock', async () => {
        lock = new SimpleLock();

        const results = await Promise.all([
          lock.lock('key1'),
          lock.lock('key1'),
          lock.lock('key1'),
        ]);

        const acquired = results.filter((r) => r === true).length;
        const denied = results.filter((r) => r === false).length;

        expect(acquired).toBe(1);
        expect(denied).toBe(2);
      });

      it('concurrent requests with timeout queue up', async () => {
        lock = new SimpleLock();

        // First acquires immediately
        const first = lock.lock('key1', { timeout: 500 });

        // Second and third wait
        const second = lock.lock('key1', { timeout: 500 });
        const third = lock.lock('key1', { timeout: 500 });

        // First should succeed
        expect(await first).toBe(true);

        // Release after small delay to let second acquire
        setTimeout(async () => {
          await lock.unlock('key1');
        }, 50);

        // Second should acquire after first releases
        expect(await second).toBe(true);

        // Release again
        setTimeout(async () => {
          await lock.unlock('key1');
        }, 50);

        // Third should acquire
        expect(await third).toBe(true);
      });
    });

    describe('onStop cleanup', () => {
      it('clears all locks on stop', async () => {
        lock = new SimpleLock();
        await lock.lock('key1');
        await lock.lock('key2');
        await lock.lock('key3');

        expect(await lock.locked('key1')).toBe(true);
        expect(await lock.locked('key2')).toBe(true);
        expect(await lock.locked('key3')).toBe(true);

        await lock.onStop();

        expect(await lock.locked('key1')).toBe(false);
        expect(await lock.locked('key2')).toBe(false);
        expect(await lock.locked('key3')).toBe(false);
      });
    });
  });

  describe('LockOptions type', () => {
    it('accepts timeout option', async () => {
      const lock = new SimpleLock();
      const options: LockOptions = { timeout: 1000 };
      await lock.lock('key', options);
      await lock.unlock('key');
    });

    it('accepts ttl option', async () => {
      const lock = new SimpleLock();
      const options: LockOptions = { ttl: 30000 };
      // SimpleLock doesn't use ttl, but should accept it
      await lock.lock('key', options);
      await lock.unlock('key');
    });

    it('accepts auth option', async () => {
      const lock = new SimpleLock();
      const options: LockOptions = { auth: 'user-123' };
      await lock.lock('key', options);
      await lock.unlock('key', { auth: 'user-123' });
    });

    it('accepts all options together', async () => {
      const lock = new SimpleLock();
      const options: LockOptions = {
        timeout: 1000,
        ttl: 30000,
        auth: 'user-123',
      };
      await lock.lock('key', options);
      await lock.unlock('key', { auth: 'user-123' });
    });
  });

  describe('UnlockOptions type', () => {
    it('accepts auth option', async () => {
      const lock = new SimpleLock();
      await lock.lock('key', { auth: 'owner' });
      const options: UnlockOptions = { auth: 'owner' };
      const result = await lock.unlock('key', options);
      expect(result).toBe(true);
    });
  });
});
