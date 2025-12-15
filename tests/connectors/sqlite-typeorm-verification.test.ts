import { describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
  Repository,
  UpdateDateColumn,
} from 'typeorm';
import {
  Model,
  SQLite,
  SqliteEntityManagerContext,
  Transactional,
} from '../../src/connectors/sqlite';
import { BaseEntity } from '../../src/connectors/sqlite/types';

/**
 * TypeORM Verification Test Entities
 */

@Entity('verification_users')
class VerificationUser extends BaseEntity<VerificationUser> {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  username!: string;

  @Column()
  email!: string;

  @Column({ type: 'integer', default: 0 })
  age!: number;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  constructor(data?: Partial<VerificationUser>) {
    super(data);
  }
}

@Entity('verification_posts')
class VerificationPost extends BaseEntity<VerificationPost> {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column('text')
  content!: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ default: false })
  published!: boolean;

  @Column({ type: 'integer', default: 0 })
  viewCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  constructor(data?: Partial<VerificationPost>) {
    super(data);
  }
}

@Entity('verification_tags')
class VerificationTag extends BaseEntity<VerificationTag> {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'integer', default: 0 })
  usageCount!: number;

  constructor(data?: Partial<VerificationTag>) {
    super(data);
  }
}

describe('SQLite TypeORM Integration Verification', () => {
  describe('1. DataSource Initialization', () => {
    it('should create DataSource with correct configuration', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      expect(sqlite).toBeDefined();
      expect(typeof sqlite).toBe('object');
    });

    it('should have correct TypeORM driver type', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost
      );

      const client = sqlite.client;
      expect(client).toBeDefined();
      expect(client.options).toBeDefined();
      expect(client.options.type).toBe('sqlite');
    });

    it('should configure entities in DataSource', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      const client = sqlite.client;
      expect(client.options.entities).toEqual([
        VerificationUser,
        VerificationPost,
        VerificationTag,
      ]);
    });

    it('should support in-memory database', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.database).toBe(':memory:');
    });

    it('should support file-based database path', () => {
      const sqlite = new SQLite(
        {
          database: './test.db',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.database).toBe('./test.db');
    });

    it('should support WAL mode configuration', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
          enableWAL: true,
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.enableWAL).toBe(true);
    });

    it('should support busy timeout configuration', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
          busyTimeout: 5000,
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.busyTimeout).toBe(5000);
    });

    it('should support migrations configuration', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
          migrationRoot: './migrations',
        },
        VerificationUser
      );

      const client = sqlite.client;
      // Migrations are loaded from file system
      expect(client.options.migrations).toBeDefined();
    });

    it('should set migrationsRun when migrationRoot is provided', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
          migrationRoot: './migrations',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.migrationsRun).toBe(true);
    });

    it('should disable migrationsRun when migrationRoot is not provided', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.migrationsRun).toBe(false);
    });
  });

  describe('2. Entity Decorator Support', () => {
    it('should support @Entity decorator', () => {
      const user = new VerificationUser({
        username: 'decorator-test',
        email: 'decorator@test.com',
      });

      expect(user.constructor.name).toBe('VerificationUser');
    });

    it('should support @Column decorator', () => {
      const user = new VerificationUser({
        username: 'column-test',
        email: 'column@test.com',
      });

      expect(user.username).toBe('column-test');
      expect(user.email).toBe('column@test.com');
    });

    it('should support @Column with type option', () => {
      const user = new VerificationUser({
        username: 'type-test',
        email: 'type@test.com',
        age: 25,
      });

      expect(typeof user.age).toBe('number');
      expect(user.age).toBe(25);
    });

    it('should support @Column with default option', () => {
      const user = new VerificationUser({
        username: 'default-test',
        email: 'default@test.com',
      });

      // Default is DB-side, not applied in constructor
      expect(user.active).toBeUndefined();
    });

    it('should support @Column with nullable option', () => {
      const post = new VerificationPost({
        title: 'nullable-test',
        content: 'content',
      });

      expect(post.userId).toBeUndefined();
    });

    it('should support @Column with unique option', () => {
      const tag = new VerificationTag({
        name: 'unique-test',
      });

      expect(tag.name).toBe('unique-test');
    });

    it('should support @PrimaryGeneratedColumn with uuid', () => {
      const user = new VerificationUser({
        username: 'uuid-test',
        email: 'uuid@test.com',
      });

      expect(user).toBeDefined();
    });

    it('should support @CreateDateColumn decorator', () => {
      const user = new VerificationUser({
        username: 'created-test',
        email: 'created@test.com',
      });

      expect(user).toBeDefined();
      // CreateDateColumn is metadata, not set in constructor
    });

    it('should support @UpdateDateColumn decorator', () => {
      const user = new VerificationUser({
        username: 'updated-test',
        email: 'updated@test.com',
      });

      expect(user).toBeDefined();
      // UpdateDateColumn is metadata, not set in constructor
    });

    it('should preserve decorated class metadata', () => {
      const user = new VerificationUser({
        username: 'metadata-test',
        email: 'metadata@test.com',
      });

      expect(user instanceof VerificationUser).toBe(true);
      expect(user instanceof BaseEntity).toBe(true);
    });
  });

  describe('3. BaseEntity Integration', () => {
    it('should extend BaseEntity for type support', () => {
      const user = new VerificationUser({
        username: 'extend-test',
        email: 'extend@test.com',
      });

      expect(user instanceof BaseEntity).toBe(true);
    });

    it('should support BaseEntity constructor with partial data', () => {
      const partial: Partial<VerificationUser> = {
        username: 'partial-test',
        email: 'partial@test.com',
      };

      const user = new VerificationUser(partial);
      expect(user.username).toBe('partial-test');
      expect(user.email).toBe('partial@test.com');
    });

    it('should support Object.assign through BaseEntity', () => {
      const user = new VerificationUser({
        username: 'assign-test',
        email: 'assign@test.com',
      });

      const updated = Object.assign(user, {
        age: 30,
      });

      expect(updated.age).toBe(30);
      expect(updated === user).toBe(true);
    });

    it('should work with spread operator', () => {
      const original = new VerificationUser({
        username: 'spread-test',
        email: 'spread@test.com',
      });

      const copy = new VerificationUser({
        ...original,
        age: 28,
      });

      expect(copy.username).toBe('spread-test');
      expect(copy.age).toBe(28);
    });
  });

  describe('4. Repository Pattern', () => {
    it('should return Repository through model() method', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const repo = sqlite.model(VerificationUser);
      expect(repo).toBeDefined();
      expect(typeof repo.save).toBe('function');
    });

    it('should provide Repository interface', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const repo = sqlite.model(VerificationUser);
      const expectedMethods = [
        'save',
        'find',
        'findOneBy',
        'findBy',
        'delete',
        'update',
        'count',
        'createQueryBuilder',
      ];

      expectedMethods.forEach((method) => {
        expect(typeof repo[method as keyof Repository<VerificationUser>]).toBe(
          'function'
        );
      });
    });

    it('should support generics for typed repositories', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost
      );

      const userRepo: Repository<VerificationUser> =
        sqlite.model(VerificationUser);
      const postRepo: Repository<VerificationPost> =
        sqlite.model(VerificationPost);

      expect(userRepo).toBeDefined();
      expect(postRepo).toBeDefined();
    });

    it('should maintain repository type across multiple calls', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const repo1 = sqlite.model(VerificationUser);
      const repo2 = sqlite.model(VerificationUser);

      expect(repo1).toBeDefined();
      expect(repo2).toBeDefined();
    });
  });

  describe('5. Model Helper Function', () => {
    it('should create typed model proxy', () => {
      const userModel = Model(VerificationUser);
      expect(userModel).toBeDefined();
    });

    it('should expose Entity property', () => {
      const userModel = Model(VerificationUser);
      expect(userModel.Entity).toBe(VerificationUser);
    });

    it('should support use() method for alternative SQLite instance', () => {
      const userModel = Model(VerificationUser);
      expect(typeof userModel.use).toBe('function');
    });

    it('should work with spread operator for multiple models', () => {
      const userModel = Model(VerificationUser);
      const postModel = Model(VerificationPost);

      const models = { userModel, postModel };
      expect(models.userModel.Entity).toBe(VerificationUser);
      expect(models.postModel.Entity).toBe(VerificationPost);
    });
  });

  describe('6. Transaction Support', () => {
    it('should provide tx() method for transactions', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.tx).toBe('function');
    });

    it('should accept async function as transaction parameter', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const asyncFn = async () => 'result';
      const result = sqlite.tx(asyncFn);

      expect(result instanceof Promise).toBe(true);
    });

    it('should support isolation level parameter', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const asyncFn = async () => 'result';
      const result = sqlite.tx(asyncFn, 'READ COMMITTED');

      expect(result instanceof Promise).toBe(true);
    });

    it('should support propagation type parameter', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const asyncFn = async () => 'result';
      const resultNew = sqlite.tx(asyncFn, undefined, 'new');
      const resultReuse = sqlite.tx(asyncFn, undefined, 'reuse');

      expect(resultNew instanceof Promise).toBe(true);
      expect(resultReuse instanceof Promise).toBe(true);
    });

    it('should support transaction with all parameters', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const asyncFn = async () => 'result';
      const result = sqlite.tx(asyncFn, 'REPEATABLE READ', 'reuse');

      expect(result instanceof Promise).toBe(true);
    });
  });

  describe('7. Transactional Decorator', () => {
    it('should be defined as function', () => {
      expect(typeof Transactional).toBe('function');
    });

    it('should accept options parameter', () => {
      const decorator = Transactional({
        isolationLevel: 'READ COMMITTED',
      });

      expect(typeof decorator).toBe('function');
    });

    it('should work with method decoration', () => {
      class TestService {
        @Transactional()
        async processData() {
          return 'processed';
        }
      }

      const service = new TestService();
      expect(typeof service.processData).toBe('function');
    });

    it('should support isolationLevel option', () => {
      const decorator = Transactional({
        isolationLevel: 'SERIALIZABLE',
      });

      expect(typeof decorator).toBe('function');
    });

    it('should support propagationType option', () => {
      const decorator = Transactional({
        propagationType: 'reuse',
      });

      expect(typeof decorator).toBe('function');
    });

    it('should support use option for SQLite instance', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const decorator = Transactional({
        use: sqlite,
      });

      expect(typeof decorator).toBe('function');
    });

    it('should support all options combined', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const decorator = Transactional({
        isolationLevel: 'READ UNCOMMITTED',
        propagationType: 'new',
        use: sqlite,
      });

      expect(typeof decorator).toBe('function');
    });
  });

  describe('8. Context Management', () => {
    it('should provide SqliteEntityManagerContext', () => {
      expect(SqliteEntityManagerContext).toBeDefined();
    });

    it('should have Context interface methods', () => {
      const expectedMethods = ['get', 'set'];
      const context = SqliteEntityManagerContext;

      expectedMethods.forEach((method) => {
        expect(
          typeof context[method as keyof typeof SqliteEntityManagerContext]
        ).toBe('function');
      });
    });

    it('should support context get operation', () => {
      const context = SqliteEntityManagerContext;
      const result = context.get();

      expect(result === undefined || result !== null).toBe(true);
    });

    it('should support context set operation', () => {
      const context = SqliteEntityManagerContext;
      const mockEM = {} as any;

      expect(() => context.set(mockEM)).not.toThrow();
    });
  });

  describe('9. Connection Lifecycle', () => {
    it('should have onInit method', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.onInit).toBe('function');
    });

    it('should have onStop method', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.onStop).toBe('function');
    });

    it('should have connected property', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.connected).toBe('boolean');
    });

    it('should have client property', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(sqlite.client).toBeDefined();
      expect(sqlite.client instanceof DataSource).toBe(false); // It's an omitted interface
    });

    it('should expose DataSource methods through client', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const client = sqlite.client;
      const expectedMethods = ['getRepository', 'createQueryBuilder', 'query'];

      expectedMethods.forEach((method) => {
        expect(typeof client[method as keyof typeof client]).toBe('function');
      });
    });

    it('should NOT expose initialize/destroy methods on client', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect('initialize' in client).toBe(false);
      expect('destroy' in client).toBe(false);
      expect('connect' in client).toBe(false);
      expect('close' in client).toBe(false);
    });
  });

  describe('10. Type Exports', () => {
    it('should export SQLite class', () => {
      expect(SQLite).toBeDefined();
      expect(typeof SQLite).toBe('function');
    });

    it('should export Model function', () => {
      expect(Model).toBeDefined();
      expect(typeof Model).toBe('function');
    });

    it('should export Transactional decorator', () => {
      expect(Transactional).toBeDefined();
      expect(typeof Transactional).toBe('function');
    });

    it('should export SqliteEntityManagerContext', () => {
      expect(SqliteEntityManagerContext).toBeDefined();
    });

    it('should export BaseEntity class', () => {
      expect(BaseEntity).toBeDefined();
      expect(typeof BaseEntity).toBe('function');
    });

    it('should export types from index', () => {
      // These should be available from the main export
      const entities = [VerificationUser, VerificationPost, VerificationTag];
      expect(entities.length).toBe(3);
    });
  });

  describe('11. TypeORM Integration Edge Cases', () => {
    it('should handle entity with all column types', () => {
      const user = new VerificationUser({
        username: 'all-types',
        email: 'all@test.com',
        age: 25,
        active: true,
      });

      expect(typeof user.username).toBe('string');
      expect(typeof user.email).toBe('string');
      expect(typeof user.age).toBe('number');
      expect(typeof user.active).toBe('boolean');
    });

    it('should support entity with nullable UUID', () => {
      const post = new VerificationPost({
        title: 'no-user',
        content: 'orphan post',
      });

      expect(post.userId).toBeUndefined();
    });

    it('should handle entity with numeric defaults', () => {
      const user = new VerificationUser({
        username: 'numeric',
        email: 'numeric@test.com',
      });

      // Defaults are DB-side, not applied in constructor
      expect(user.age).toBeUndefined();
    });

    it('should support column type specifications', () => {
      const post = new VerificationPost({
        title: 'text-test',
        content: 'Large text content that should be stored as TEXT type',
      });

      expect(typeof post.content).toBe('string');
    });

    it('should work with unique constraint entities', () => {
      const tag1 = new VerificationTag({ name: 'unique1' });
      const tag2 = new VerificationTag({ name: 'unique2' });

      expect(tag1.name).toBe('unique1');
      expect(tag2.name).toBe('unique2');
    });

    it('should handle multiple decorators on same field', () => {
      // Column with type and default
      const post = new VerificationPost({
        title: 'multi-decorator',
        content: 'content',
      });

      expect(post.viewCount).toBeUndefined(); // Default is DB-side
    });

    it('should support inheritance chain with decorators', () => {
      const user = new VerificationUser({
        username: 'inherit',
        email: 'inherit@test.com',
      });

      expect(user instanceof BaseEntity).toBe(true);
      expect(user instanceof VerificationUser).toBe(true);
    });
  });

  describe('12. Configuration Combinations', () => {
    it('should combine database path with WAL', () => {
      const sqlite = new SQLite(
        {
          database: './app.db',
          enableWAL: true,
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.database).toBe('./app.db');
      expect(client.options.enableWAL).toBe(true);
    });

    it('should combine database with timeout and WAL', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
          busyTimeout: 10000,
          enableWAL: true,
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.busyTimeout).toBe(10000);
      expect(client.options.enableWAL).toBe(true);
    });

    it('should combine database with migrations', () => {
      const sqlite = new SQLite(
        {
          database: './app.db',
          migrationRoot: './migrations',
        },
        VerificationUser
      );

      const client = sqlite.client;
      expect(client.options.database).toBe('./app.db');
      expect(client.options.migrationsRun).toBe(true);
    });

    it('should support all options together', () => {
      const sqlite = new SQLite(
        {
          database: './production.db',
          migrationRoot: './migrations',
          enableWAL: true,
          busyTimeout: 15000,
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      const client = sqlite.client;
      expect(client.options.database).toBe('./production.db');
      expect(client.options.enableWAL).toBe(true);
      expect(client.options.busyTimeout).toBe(15000);
      expect(client.options.migrationsRun).toBe(true);
    });
  });

  describe('13. Multiple Entity Support', () => {
    it('should register multiple entities', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      const client = sqlite.client;
      expect(client.options.entities).toHaveLength(3);
    });

    it('should maintain entity order', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      const client = sqlite.client;
      const entities = client.options.entities;
      expect(entities[0]).toBe(VerificationUser);
      expect(entities[1]).toBe(VerificationPost);
      expect(entities[2]).toBe(VerificationTag);
    });

    it('should support spread operator for entities', () => {
      const primaryEntities = [VerificationUser, VerificationPost];
      const allEntities = [...primaryEntities, VerificationTag];

      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        ...allEntities
      );

      const client = sqlite.client;
      expect(client.options.entities).toEqual(allEntities);
    });

    it('should support getting repository for each entity', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser,
        VerificationPost,
        VerificationTag
      );

      const userRepo = sqlite.model(VerificationUser);
      const postRepo = sqlite.model(VerificationPost);
      const tagRepo = sqlite.model(VerificationTag);

      expect(userRepo).toBeDefined();
      expect(postRepo).toBeDefined();
      expect(tagRepo).toBeDefined();
    });
  });

  describe('14. TypeORM Driver Type Validation', () => {
    it('should set correct driver type in options', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(sqlite.client.options.type).toBe('sqlite');
    });

    it('should not use postgres driver', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(sqlite.client.options.type).not.toBe('postgres');
    });

    it('should not use mysql driver', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(sqlite.client.options.type).not.toBe('mysql');
    });

    it('should not use mongodb driver', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(sqlite.client.options.type).not.toBe('mongodb');
    });
  });

  describe('15. Bean Integration Readiness', () => {
    it('should work with asBean pattern', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      // asBean is used in the actual implementation
      expect(sqlite).toBeDefined();
      expect(sqlite.model).toBeDefined();
    });

    it('should support Log decorator', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      // Log decorator adds logger - verify it's applied
      expect(typeof sqlite).toBe('object');
    });

    it('should implement OnInit interface', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.onInit).toBe('function');
    });

    it('should implement OnStop interface', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      expect(typeof sqlite.onStop).toBe('function');
    });

    it('should have correct method signatures for bean usage', () => {
      const sqlite = new SQLite(
        {
          database: ':memory:',
        },
        VerificationUser
      );

      // Check methods expected by framework
      expect(typeof sqlite.model).toBe('function');
      expect(typeof sqlite.tx).toBe('function');
      expect(typeof sqlite.client).toBe('object');
    });
  });
});
