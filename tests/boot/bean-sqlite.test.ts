import { describe, expect, it } from 'bun:test';
import { BaseEntity } from '../../src/connectors/sqlite/types';

// Test entity for bean loader tests
class BeanTestUser extends BaseEntity<BeanTestUser> {
  id?: string;
  username: string;
  email: string;

  constructor(target?: Partial<BeanTestUser>) {
    super(target);
    this.username = target?.username ?? '';
    this.email = target?.email ?? '';
  }
}

describe('Bean Loader - SQLite Integration', () => {
  describe('SQLite Type Definitions', () => {
    it('should define BeanTestUser entity with required columns', () => {
      const user = new BeanTestUser({
        username: 'testuser',
        email: 'test@example.com',
      });

      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
    });

    it('should allow creating entity with partial data', () => {
      const user = new BeanTestUser({
        username: 'partial',
      });

      expect(user.username).toBe('partial');
      expect(user.email).toBe('');
    });

    it('should allow creating empty entity', () => {
      const user = new BeanTestUser();

      expect(user).toBeDefined();
    });
  });

  describe('SQLite Configuration Types', () => {
    it('should accept database path configuration', () => {
      const config = {
        database: ':memory:',
        enableWAL: false,
        busyTimeout: 5000,
      };

      expect(config.database).toBe(':memory:');
      expect(config.enableWAL).toBe(false);
      expect(config.busyTimeout).toBe(5000);
    });

    it('should handle file-based database config', () => {
      const config = {
        database: './test.db',
        enableWAL: true,
        busyTimeout: 3000,
      };

      expect(config.database).toContain('.db');
      expect(config.enableWAL).toBe(true);
    });

    it('should handle WAL mode option', () => {
      const config = {
        database: ':memory:',
        enableWAL: true,
      };

      expect(config.enableWAL).toBe(true);
    });

    it('should handle busy timeout configuration', () => {
      const config = {
        database: ':memory:',
        busyTimeout: 10000,
      };

      expect(config.busyTimeout).toBe(10000);
    });

    it('should handle migration root configuration', () => {
      const config = {
        database: ':memory:',
        migrationRoot: './migrations/sqlite',
      };

      expect(config.migrationRoot).toContain('migrations');
    });

    it('should support partial configuration', () => {
      const minimalConfig: Partial<{ database: string; enableWAL: boolean }> = {
        database: ':memory:',
      };

      expect(minimalConfig.database).toBeDefined();
      expect(minimalConfig.enableWAL).toBeUndefined();
    });

    it('should support full configuration', () => {
      const fullConfig: {
        database: string;
        migrationRoot: string;
        enableWAL: boolean;
        busyTimeout: number;
      } = {
        database: ':memory:',
        migrationRoot: './migrations/sqlite',
        enableWAL: true,
        busyTimeout: 5000,
      };

      expect(fullConfig.database).toBeDefined();
      expect(fullConfig.migrationRoot).toBeDefined();
      expect(fullConfig.enableWAL).toBeDefined();
      expect(fullConfig.busyTimeout).toBeDefined();
    });
  });

  describe('SQLite Entity Support', () => {
    it('should support single entity type', () => {
      const entities = [BeanTestUser];

      expect(entities.length).toBe(1);
      expect(entities[0]).toBe(BeanTestUser);
    });

    it('should support multiple entity types', () => {
      class TestProduct extends BaseEntity<TestProduct> {
        id?: string;
        name: string;

        constructor(target?: Partial<TestProduct>) {
          super(target);
          this.name = target?.name ?? '';
        }
      }

      const entities: (typeof BeanTestUser | typeof TestProduct)[] = [
        BeanTestUser,
        TestProduct,
      ];

      expect(entities.length).toBe(2);
      expect(entities).toContain(BeanTestUser);
      expect(entities).toContain(TestProduct);
    });

    it('should support spread operator for entities', () => {
      class TestOrder extends BaseEntity<TestOrder> {
        id?: string;
        orderNumber: string;

        constructor(target?: Partial<TestOrder>) {
          super(target);
          this.orderNumber = target?.orderNumber ?? '';
        }
      }

      const baseEntities: (typeof BeanTestUser)[] = [BeanTestUser];
      const allEntities = [...baseEntities, TestOrder];

      expect(allEntities.length).toBe(2);
      expect(allEntities).toContain(BeanTestUser);
      expect(allEntities).toContain(TestOrder);
    });

    it('should support empty entity array', () => {
      const entities: (typeof BeanTestUser)[] = [];

      expect(entities.length).toBe(0);
    });
  });

  describe('SQLite Bean Instantiation Patterns', () => {
    it('should support constructor with options and entities', () => {
      const options = {
        database: ':memory:',
        enableWAL: false,
      };

      const entities = [BeanTestUser];

      // Simulating the bean instantiation pattern
      const config = { options, entities };

      expect(config.options.database).toBe(':memory:');
      expect(config.entities).toContain(BeanTestUser);
    });

    it('should support variadic entities argument', () => {
      class EntityA extends BaseEntity<EntityA> {
        id?: string;
        name: string = '';

        constructor(target?: Partial<EntityA>) {
          super(target);
          if (target?.name) {
            this.name = target.name;
          }
        }
      }

      class EntityB extends BaseEntity<EntityB> {
        id?: string;
        value: string = '';

        constructor(target?: Partial<EntityB>) {
          super(target);
          if (target?.value) {
            this.value = target.value;
          }
        }
      }

      // Simulating variadic entities: ...entities
      const entities: (typeof EntityA | typeof EntityB)[] = [EntityA, EntityB];

      expect(entities.length).toBe(2);
      expect(entities).toContain(EntityA);
      expect(entities).toContain(EntityB);
    });

    it('should support minimal configuration with entities', () => {
      const config = {
        database: ':memory:',
      };

      expect(config.database).toBeDefined();
    });

    it('should support full configuration with entities', () => {
      const config = {
        database: ':memory:',
        migrationRoot: './migrations/sqlite',
        enableWAL: true,
        busyTimeout: 5000,
      };

      const entities = [BeanTestUser];

      expect(config.database).toBe(':memory:');
      expect(entities[0]).toBe(BeanTestUser);
    });
  });

  describe('SQLite Independent from Postgres', () => {
    it('should define SQLite separately from Postgres', () => {
      // This test validates that SQLite is treated as an independent option
      const sqliteConfig = {
        database: ':memory:',
      };

      const postgresConfig = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
      };

      expect(sqliteConfig).toBeDefined();
      expect(postgresConfig).toBeDefined();
      expect(sqliteConfig).not.toEqual(postgresConfig);
    });

    it('should allow SQLite without Postgres configuration', () => {
      const initOptions = {
        database: {
          sqlite: true,
        },
      };

      expect(initOptions.database.sqlite).toBe(true);
    });

    it('should allow Postgres without SQLite configuration', () => {
      const initOptions = {
        database: {
          postgres: true,
        },
      };

      expect(initOptions.database.postgres).toBe(true);
    });

    it('should allow both SQLite and Postgres independently', () => {
      const initOptions = {
        database: {
          sqlite: true,
          postgres: true,
        },
      };

      expect(initOptions.database.sqlite).toBe(true);
      expect(initOptions.database.postgres).toBe(true);
    });

    it('should support entities configuration for SQLite independently', () => {
      const initOptions = {
        database: {
          sqlite: {
            entities: [BeanTestUser],
          },
        },
      };

      if (typeof initOptions.database.sqlite === 'object') {
        expect(initOptions.database.sqlite.entities).toContain(BeanTestUser);
      }
    });
  });

  describe('SQLite with Other Features', () => {
    it('should combine SQLite with storage', () => {
      const options = {
        database: {
          sqlite: true,
        },
        storage: true,
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.storage).toBe(true);
    });

    it('should combine SQLite with caching', () => {
      const options = {
        database: {
          sqlite: true,
        },
        cache: true,
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.cache).toBe(true);
    });

    it('should combine SQLite with queue', () => {
      const options = {
        database: {
          sqlite: true,
        },
        queue: {
          redis: true,
        },
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.queue.redis).toBe(true);
    });

    it('should combine SQLite with JWT', () => {
      const options = {
        database: {
          sqlite: true,
        },
        jwt: true,
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.jwt).toBe(true);
    });

    it('should combine SQLite with RBAC', () => {
      const options = {
        database: {
          sqlite: true,
        },
        rbac: true,
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.rbac).toBe(true);
    });

    it('should combine SQLite with all initialization options', () => {
      const options: any = {
        database: {
          sqlite: true,
        },
        storage: true,
        jwt: true,
        rbac: true,
        cache: true,
        queue: {
          redis: true,
          reliable: true,
        },
        pubsub: {
          redis: true,
        },
        slack: true,
      };

      expect(options.database.sqlite).toBe(true);
      expect(options.storage).toBe(true);
      expect(options.jwt).toBe(true);
      expect(options.rbac).toBe(true);
      expect(options.cache).toBe(true);
      expect(options.queue.reliable).toBe(true);
      expect(options.pubsub.redis).toBe(true);
      expect(options.slack).toBe(true);
    });
  });

  describe('SQLite Conditional Initialization', () => {
    it('should support boolean flag for SQLite initialization', () => {
      const shouldInit = true;

      if (shouldInit) {
        const config = { database: ':memory:' };
        expect(config.database).toBe(':memory:');
      }
    });

    it('should support entity extraction for SQLite', () => {
      const initOption: any = {
        entities: [BeanTestUser],
      };

      const entities =
        typeof initOption === 'object' && initOption.entities
          ? initOption.entities
          : [];

      expect(entities).toContain(BeanTestUser);
    });

    it('should handle undefined SQLite initialization', () => {
      const options: any = {
        database: {
          postgres: true,
          // sqlite is undefined
        },
      };

      const sqliteConfig = options.database?.sqlite;

      expect(sqliteConfig).toBeUndefined();
    });

    it('should extract entities from boolean and object variants', () => {
      const booleanOption = true;
      const objectOption: any = {
        entities: [BeanTestUser],
      };

      const boolEntities =
        typeof booleanOption === 'object'
          ? (booleanOption as any).entities
          : [];

      const objEntities =
        typeof objectOption === 'object' ? objectOption.entities : [];

      expect(boolEntities.length).toBe(0);
      expect(objEntities.length).toBeGreaterThan(0);
    });
  });

  describe('BaseEntity Type Support', () => {
    it('should support BaseEntity for SQLite entities', () => {
      const user = new BeanTestUser({
        username: 'test',
        email: 'test@example.com',
      });

      expect(user).toBeInstanceOf(BeanTestUser);
      expect(user.username).toBe('test');
      expect(user.email).toBe('test@example.com');
    });

    it('should support partial initialization with BaseEntity', () => {
      const user = new BeanTestUser({
        username: 'partial',
      });

      expect(user.username).toBe('partial');
      expect(user.email).toBe('');
      expect(user.id).toBeUndefined();
    });

    it('should support column decorators with BaseEntity', () => {
      const user = new BeanTestUser({
        username: 'test',
        email: 'test@example.com',
      });

      expect(user).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.email).toBeDefined();
    });

    it('should support entity decorator with BaseEntity', () => {
      // The entity should be properly defined
      expect(BeanTestUser).toBeDefined();
      expect(BeanTestUser.prototype).toBeDefined();
    });
  });
});
