import postgres from 'postgres';
import { beanOf } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';

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
} & postgres.Options<Record<string, postgres.PostgresType>>;

/**
 * A Postgres instance.
 */
@Log
export class Postgres {
  private readonly logger: Logger;
  private readonly options: Partial<PostgresOptions>;
  private readonly instance: postgres.Sql;

  constructor(options: Partial<PostgresOptions>) {
    this.instance = postgres({
      ...options,
      ssl: options.ssl || options.tls,
    });
    this.options = options;
  }

  /**
   * Retrieves a Postgres client.
   */
  get client() {
    return this.instance;
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
}

/**
 * Available types that can be considered as a {@link Postgres} instance/bean.
 */
export type PostgresBean = Class<Postgres> | Postgres | string;

/**
 * Creates a function for executing SQL commands using given {@link Postgres} type.
 */
export function Sql(options?: {
  /**
   * {@link Postgres} instance/bean to use.
   */
  use: PostgresBean;
}) {
  const use = options?.use ?? Postgres;
  const instance = use instanceof Postgres ? use : beanOf(use);
  return instance.client;
}
