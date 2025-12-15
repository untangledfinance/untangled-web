import { DataSource, EntityManager, ObjectLiteral, Repository } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { OnInit, OnStop, beanOf } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { SqliteEntityManagerContext } from './context';
import { EntityType, PropagationType, SqliteOptions } from './types';
import { Migrations } from './utils';

/**
 * A SQLite connector using TypeORM with the 'sqlite' driver.
 * Provides a TypeORM-based interface for SQLite, similar to the Postgres connector.
 */
@Log
export class SQLite implements OnInit, OnStop {
  private readonly logger: Logger;
  private readonly options: Partial<SqliteOptions>;
  private readonly dataSource: DataSource;
  private readonly entities: EntityType[];

  /**
   * Creates a new SQLite connector instance.
   * @param options SQLite connection options including database path, migrations, and performance settings.
   * @param options.database Path to the SQLite database file (e.g., './data.db' or ':memory:' for in-memory database).
   * @param options.migrationRoot Optional path to migration files directory.
   * @param options.enableWAL Optional flag to enable Write-Ahead Logging mode for better performance.
   * @param options.busyTimeout Optional timeout in milliseconds for handling SQLITE_BUSY errors.
   * @param entities Entity classes to be used with this SQLite instance.
   */
  constructor(options: Partial<SqliteOptions>, ...entities: EntityType[]) {
    this.dataSource = new DataSource({
      type: 'sqlite',
      database: options.database,
      entities,
      migrations: Migrations.from(options.migrationRoot, {
        debug: process.env['DEBUG'] === 'true',
      }),
      migrationsRun: !!options.migrationRoot,
      enableWAL: options.enableWAL,
      busyTimeout: options.busyTimeout,
    });
    this.options = options;
    this.entities = entities;
  }

  get connected() {
    return this.dataSource.isInitialized;
  }

  protected async connect() {
    if (this.connected) return;
    this.dataSource.setOptions({
      type: 'sqlite',
      ...this.dataSource.options,
      entities: this.entities,
    });
    await this.dataSource.initialize();
    this.logger.info('Connected');
  }

  protected async disconnect() {
    if (!this.connected) return;
    await this.dataSource.destroy();
    this.logger.info('Disconnected');
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.disconnect();
  }

  /**
   * Retrieves a SQLite client.
   *
   * Note: Unlike the Postgres connector, SQLite does not provide a db() method
   * for switching databases. SQLite typically uses a single database file per connection.
   * To work with multiple SQLite databases, create separate SQLite instances with
   * different database paths.
   */
  get client(): Omit<
    DataSource,
    'initialize' | 'destroy' | 'connect' | 'close'
  > {
    return this.dataSource;
  }

  /**
   * Creates a repository model.
   * @param entity type of the model (an Entity class).
   */
  model<T extends ObjectLiteral>(entity: EntityType<T>) {
    const m = SqliteEntityManagerContext.get();
    return (m || this.dataSource).getRepository<T>(entity);
  }

  /**
   * Executes a function in a transaction.
   * @param run the function.
   * @param isolationLevel isolation level of the transaction.
   * @param propagationType propagation type of the transaction (default: new).
   */
  tx<T>(
    run: () => Promise<T>,
    isolationLevel?: IsolationLevel,
    propagationType: PropagationType = 'new'
  ) {
    const runInTransaction = async (em: EntityManager) => {
      const m = SqliteEntityManagerContext.get();
      try {
        SqliteEntityManagerContext.set(propagationType === 'reuse' ? m : em);
        return run();
      } finally {
        SqliteEntityManagerContext.set(m);
      }
    };
    if (isolationLevel)
      return this.dataSource.transaction(isolationLevel, runInTransaction);
    return this.dataSource.transaction(runInTransaction);
  }
}

/**
 * Available types that can be considered as a {@link SQLite} instance/bean.
 */
export type SqliteBean = Class<SQLite> | SQLite | string;

/**
 * Creates a model with specific name using given {@link SQLite} type.
 * @param entity type of the model (an Entity class).
 */
export function Model<T extends ObjectLiteral>(
  entity: EntityType<T>,
  options?: {
    /**
     * {@link SQLite} instance/bean to use.
     */
    use: SqliteBean;
  }
) {
  const use = options?.use ?? SQLite;
  const model = () => {
    const sqlite = use instanceof SQLite ? use : beanOf(use);
    return new Proxy(sqlite.model(entity), {
      get: (target, key) => {
        return target[key];
      },
    });
  };
  return new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === 'use') {
          return (sqlite: SqliteBean = use) => Model(entity, { use: sqlite });
        }
        if (key === 'Entity') {
          return entity;
        }
        return model()[key];
      },
    }
  ) as unknown as Repository<T> & {
    /**
     * Uses another {@link SQLite} instance/bean if specified.
     */
    use: (sqlite?: SqliteBean) => Repository<T>;
    /**
     * Returns the associated entity class of the model.
     */
    Entity: EntityType<T>;
  };
}

/**
 * Only executes the method inside a {@link SQLite} transaction.
 */
export function Transactional(
  options?: Partial<{
    /**
     * Isolation level of the transaction.
     */
    isolationLevel: IsolationLevel;
    /**
     * Propagation type of the transaction (default: new).
     */
    propagationType: PropagationType;
    /**
     * {@link SQLite} instance/bean to use.
     */
    use: SqliteBean;
  }>
) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const use = options?.use ?? SQLite;
    const func = descriptor.value;
    const transactional = async function (...args: any[]) {
      const sqlite = use instanceof SQLite ? use : beanOf(use);
      return sqlite.tx(
        () => func.bind(this)(...args),
        options?.isolationLevel,
        options?.propagationType
      );
    };
    descriptor.value = transactional;
  };
}
