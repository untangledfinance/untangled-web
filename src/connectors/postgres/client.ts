import { DataSource, EntityManager, ObjectLiteral, Repository } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { beanOf, OnInit, OnStop } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { EntityManagerContext } from './context';

/**
 * PostgreSQL connection options.
 */
export type PostgresOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  tls: boolean;
};

/**
 * Model type (an Entity class).
 */
export type EntityType<T extends ObjectLiteral = ObjectLiteral> = {
  new (...args: any[]): T;
};

export type PropagationType = 'reuse' | 'new';

/**
 * A Postgres instance.
 */
@Log
export class Postgres implements OnInit, OnStop {
  private readonly logger: Logger;
  private readonly options: Partial<PostgresOptions>;
  private readonly dataSource: DataSource;
  private readonly entities: EntityType[];

  constructor(options: Partial<PostgresOptions>, ...entities: EntityType[]) {
    this.dataSource = new DataSource({
      type: 'postgres',
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      database: options.database,
      ssl: options.tls,
      entities,
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
      type: 'postgres',
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
   * Retrieves a Postgres client.
   */
  get client(): Omit<
    DataSource,
    'initialize' | 'destroy' | 'connect' | 'close'
  > {
    return this.dataSource;
  }

  /**
   * Retrieves a Postgres client to a given database.
   * @param name name of the database.
   */
  db(name?: string) {
    return new Postgres({
      ...this.options,
      database: name,
    }).client;
  }

  /**
   * Creates a repository model.
   * @param entity type of the model (an Entity class).
   */
  model<T extends ObjectLiteral>(entity: EntityType<T>) {
    const m = EntityManagerContext.get();
    return (m || this.dataSource).getRepository<T>(entity);
  }

  /**
   * Executes a function in a transaction.
   * @param run the function.
   * @param isolationLevel isolation level of the transaction.
   */
  tx<T>(
    run: () => Promise<T>,
    isolationLevel?: IsolationLevel,
    propagationType: PropagationType = 'new'
  ) {
    const runInTransaction = async (em: EntityManager) => {
      const m = EntityManagerContext.get();
      try {
        EntityManagerContext.set(propagationType === 'reuse' ? m : em);
        return run();
      } finally {
        EntityManagerContext.set(m);
      }
    };
    if (isolationLevel)
      return this.dataSource.transaction(isolationLevel, runInTransaction);
    return this.dataSource.transaction(runInTransaction);
  }
}

/**
 * Available types that can be considered as a {@link Postgres} instance/bean.
 */
export type PostgresBean = Class<Postgres> | Postgres | string;

/**
 * Creates a model with specific name using given {@link Postgres} type.
 * @param entity type of the model (an Entity class).
 */
export function Model<T extends ObjectLiteral>(
  entity: EntityType<T>,
  options?: {
    /**
     * {@link Postgres} instance/bean to use.
     */
    use: PostgresBean;
  }
) {
  const use = options?.use ?? Postgres;
  const model = () => {
    const postgres = use instanceof Postgres ? use : beanOf(use);
    return new Proxy(postgres.model(entity), {
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
          return (postgres: PostgresBean = use) =>
            Model(entity, { use: postgres });
        }
        if (key === 'Entity') {
          return entity;
        }
        return model()[key];
      },
    }
  ) as unknown as Repository<T> & {
    /**
     * Uses another {@link Postgres} instance/bean if specified.
     */
    use: (postgres?: PostgresBean) => Repository<T>;
    /**
     * Returns the associated entity class of the model.
     */
    Entity: EntityType<T>;
  };
}

/**
 * Only executes the method inside a {@link Postgres} transaction.
 */
export function Transactional(
  options?: Partial<{
    /**
     * Isolation level of the transaction.
     */
    isolationLevel: IsolationLevel;
    /**
     * {@link Postgres} instance/bean to use.
     */
    use: PostgresBean;
  }>
) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const use = options?.use ?? Postgres;
    const func = descriptor.value;
    const transactional = async function (...args: any[]) {
      const postgres = use instanceof Postgres ? use : beanOf(use);
      return postgres.tx(
        () => func.bind(this)(...args),
        options?.isolationLevel
      );
    };
    descriptor.value = transactional;
  };
}
