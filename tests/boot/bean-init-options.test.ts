import { describe, expect, it } from 'bun:test';
import type { InitOptions } from '../../src/boot/loaders/bean';
import { EntityType as SqliteEntityType } from '../../src/connectors/sqlite';

describe('InitOptions - SQLite Configuration', () => {
  describe('Type Definitions', () => {
    it('should allow sqlite as boolean option', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
      };

      expect(options.database?.sqlite).toBe(true);
    });

    it('should allow sqlite with entities configuration', () => {
      const MockEntity = class {};
      const entities: SqliteEntityType[] = [MockEntity as any];

      const options: InitOptions = {
        database: {
          sqlite: {
            entities,
          },
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      if (options.database && typeof options.database.sqlite === 'object') {
        expect(options.database.sqlite.entities).toEqual(entities);
      }
    });

    it('should allow sqlite alongside other database options', () => {
      const options: InitOptions = {
        database: {
          mongo: true,
          postgres: true,
          sqlite: true,
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.database?.mongo).toBe(true);
      expect(options.database?.postgres).toBe(true);
    });

    it('should allow sqlite with postgres having entities', () => {
      const SqliteEntity = class {};
      const PostgresEntity = class {};

      const options: InitOptions = {
        database: {
          postgres: {
            entities: [PostgresEntity as any],
          },
          sqlite: {
            entities: [SqliteEntity as any],
          },
        },
      };

      expect(options.database && options.database.sqlite).toBeDefined();
      expect(options.database && options.database.postgres).toBeDefined();
    });

    it('should allow sqlite with all other initialization options', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        storage: true,
        jwt: true,
        rbac: true,
        cache: true,
        queue: {
          reliable: true,
          redis: true,
        },
        pubsub: {
          redis: true,
        },
        slack: true,
        scheduler: {
          enabled: true,
          jobs: [],
        },
        safeExit: true,
      };

      expect(options.database && options.database.sqlite).toBe(true);
      expect(options.storage).toBe(true);
      expect(options.jwt).toBe(true);
    });

    it('should allow sqlite as optional property', () => {
      const optionsWithSqlite: InitOptions = {
        database: {
          sqlite: true,
        },
      };

      const optionsWithoutSqlite: InitOptions = {
        database: {
          mongo: true,
        },
      };

      expect(
        optionsWithSqlite.database && optionsWithSqlite.database.sqlite
      ).toBe(true);
      expect(
        optionsWithoutSqlite.database && optionsWithoutSqlite.database.sqlite
      ).toBeUndefined();
    });

    it('should allow empty database object', () => {
      const options: InitOptions = {
        database: {},
      };

      expect(options.database).toBeDefined();
      expect(options.database?.sqlite).toBeUndefined();
    });

    it('should allow undefined database object', () => {
      const options: InitOptions = {};

      expect(options.database).toBeUndefined();
    });
  });

  describe('SQLite Entity Type Compatibility', () => {
    it('should accept class constructors as entities', () => {
      class TestEntity {
        id: string;
        name: string;
      }

      const entities: SqliteEntityType[] = [TestEntity];

      const options: InitOptions = {
        database: {
          sqlite: {
            entities,
          },
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      if (options.database && typeof options.database.sqlite === 'object') {
        expect(options.database.sqlite.entities).toContain(TestEntity);
      }
    });

    it('should accept multiple entity types', () => {
      class User {}
      class Product {}
      class Order {}

      const entities: SqliteEntityType[] = [User, Product, Order];

      const options: InitOptions = {
        database: {
          sqlite: {
            entities,
          },
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      if (options.database && typeof options.database.sqlite === 'object') {
        expect(options.database.sqlite.entities.length).toBe(3);
      }
    });

    it('should accept empty entities array', () => {
      const entities: SqliteEntityType[] = [];

      const options: InitOptions = {
        database: {
          sqlite: {
            entities,
          },
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      if (options.database && typeof options.database.sqlite === 'object') {
        expect(options.database.sqlite.entities.length).toBe(0);
      }
    });
  });

  describe('InitOptions Composition', () => {
    it('should allow combining sqlite with storage', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        storage: true,
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.storage).toBe(true);
    });

    it('should allow combining sqlite with caching', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        cache: true,
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.cache).toBe(true);
    });

    it('should allow combining sqlite with queue', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        queue: {
          redis: true,
          reliable: false,
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.queue?.redis).toBe(true);
    });

    it('should allow combining sqlite with pubsub', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        pubsub: {
          redis: true,
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.pubsub?.redis).toBe(true);
    });

    it('should allow combining sqlite with scheduler', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
        scheduler: {
          enabled: true,
          jobs: [],
          onError: async (job, task, error) => {
            // Handle error
          },
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.scheduler?.enabled).toBe(true);
    });

    it('should allow combining sqlite with all features', () => {
      const options: InitOptions = {
        database: {
          mongo: true,
          postgres: {
            entities: [],
          },
          sqlite: {
            entities: [],
          },
        },
        storage: true,
        jwt: true,
        rbac: true,
        cache: true,
        queue: {
          reliable: true,
          redis: true,
        },
        pubsub: {
          redis: true,
        },
        slack: true,
        scheduler: {
          enabled: true,
          jobs: [],
        },
        safeExit: true,
      };

      expect(options.database?.sqlite).toBeDefined();
      expect(options.storage).toBe(true);
      expect(options.jwt).toBe(true);
      expect(options.rbac).toBe(true);
      expect(options.cache).toBe(true);
      expect(options.queue?.reliable).toBe(true);
      expect(options.pubsub?.redis).toBe(true);
      expect(options.slack).toBe(true);
      expect(options.scheduler?.enabled).toBe(true);
      expect(options.safeExit).toBe(true);
    });
  });

  describe('SQLite vs Postgres Independence', () => {
    it('should allow sqlite only without postgres', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.database?.postgres).toBeUndefined();
    });

    it('should allow postgres only without sqlite', () => {
      const options: InitOptions = {
        database: {
          postgres: true,
        },
      };

      expect(options.database?.postgres).toBe(true);
      expect(options.database?.sqlite).toBeUndefined();
    });

    it('should allow both sqlite and postgres', () => {
      const options: InitOptions = {
        database: {
          sqlite: {
            entities: [],
          },
          postgres: {
            entities: [],
          },
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      expect(options.database?.postgres).toBeDefined();
    });

    it('should allow sqlite with boolean while postgres has entities', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
          postgres: {
            entities: [],
          },
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.database?.postgres).toBeDefined();
    });

    it('should allow sqlite with entities while postgres is boolean', () => {
      const options: InitOptions = {
        database: {
          sqlite: {
            entities: [],
          },
          postgres: true,
        },
      };

      expect(options.database?.sqlite).toBeDefined();
      expect(options.database?.postgres).toBe(true);
    });
  });

  describe('Optional Properties', () => {
    it('should allow completely minimal options', () => {
      const options: InitOptions = {};

      expect(options.database).toBeUndefined();
      expect(options.storage).toBeUndefined();
      expect(options.jwt).toBeUndefined();
    });

    it('should allow only database configuration', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
        },
      };

      expect(options.database?.sqlite).toBe(true);
      expect(options.storage).toBeUndefined();
    });

    it('should allow safe exit as boolean', () => {
      const options: InitOptions = {
        safeExit: true,
      };

      expect(options.safeExit).toBe(true);
    });

    it('should allow safe exit as function', () => {
      const exitFn = async () => {};
      const options: InitOptions = {
        safeExit: exitFn,
      };

      expect(options.safeExit).toBe(exitFn);
    });

    it('should allow new callback function', () => {
      const newFn = async () => {};
      const options: InitOptions = {
        new: newFn,
      };

      expect(options.new).toBe(newFn);
    });
  });

  describe('Database Option Structure', () => {
    it('should require database to be Partial type', () => {
      const options: InitOptions = {
        database: {
          sqlite: true,
          // Can have any subset of database options
        },
      };

      expect(options.database).toBeDefined();
    });

    it('should allow mixing database options', () => {
      const options: InitOptions = {
        database: {
          mongo: true,
          sqlite: true,
          // postgres is optional
        },
      };

      expect(options.database?.mongo).toBe(true);
      expect(options.database?.sqlite).toBe(true);
      expect(options.database?.postgres).toBeUndefined();
    });

    it('should handle complex entities in sqlite', () => {
      class ComplexEntity {
        id: string;
        name: string;
        metadata: Record<string, unknown>;
        tags: string[];
      }

      const options: InitOptions = {
        database: {
          sqlite: {
            entities: [ComplexEntity as any],
          },
        },
      };

      expect(options.database && options.database.sqlite).toBeDefined();
      if (options.database && typeof options.database.sqlite === 'object') {
        expect(options.database.sqlite.entities.length).toBe(1);
        expect(options.database.sqlite.entities[0]).toBe(ComplexEntity);
      }
    });
  });
});
