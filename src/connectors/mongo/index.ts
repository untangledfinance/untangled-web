import mongoose from 'mongoose';
import { beanOf, OnInit, OnStop } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { TModel } from './types';

export type PollingOptions = {
  /**
   * Polling interval in milliseconds.
   */
  interval?: number;
  /**
   * Executes when the MongoDB connection is not connected.
   */
  onDisconnect?: (mongo: Mongo) => void;
  /**
   * Executes when the MongoDB connection is connected again.
   */
  onReconnect?: (mongo: Mongo) => void;
};

/**
 * MongoDB connection options.
 */
export type MongoOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  tls: boolean;
};

/**
 * Starts polling a given {@link Mongo} instance's connection.
 */
export function poll(instance: Mongo, options: PollingOptions = {}) {
  if (!instance || !options.interval) return;
  let connected = undefined;
  setInterval(() => {
    try {
      const disconnected = connected && !instance.connected;
      const reconnected = connected === false && instance.connected;
      if (disconnected && options.onDisconnect) {
        return options.onDisconnect(instance);
      }
      if (reconnected && options.onReconnect) {
        return options.onReconnect(instance);
      }
    } finally {
      if (connected === undefined && instance.connected) {
        connected = true;
      } else if (connected !== undefined) {
        connected = instance.connected;
      }
    }
  }, options.interval);
}

/**
 * A MongoDB instance.
 */
@Log
export class Mongo implements OnInit, OnStop {
  private readonly logger: Logger;
  private readonly options: Partial<MongoOptions>;
  private readonly instance: mongoose.Mongoose;

  constructor(options: Partial<MongoOptions>) {
    this.instance = new mongoose.Mongoose();
    this.options = options;
  }

  /**
   * Checks if the associated connection is ready.
   */
  get connected() {
    return (
      this.instance.connection.readyState ===
      mongoose.ConnectionStates.connected
    );
  }

  protected async connect() {
    if (this.connected) return;
    const {
      host = 'localhost',
      port = 27017,
      username,
      password,
      database = 'test',
      tls,
    } = this.options;
    const uri = `mongodb://${host}:${port}`;
    await this.instance.connect(uri, {
      user: username,
      pass: password,
      dbName: database,
      tls,
      rejectUnauthorized: true,
    });
    this.logger.info('Connected');
  }

  protected async disconnect() {
    if (!this.connected) return;
    await this.instance.disconnect();
    this.logger.info('Disconnected');
  }

  /**
   * Retrieves a Mongo client.
   */
  get client() {
    return this.instance.connection.getClient() as Omit<
      mongoose.mongo.MongoClient,
      'connect' | 'close'
    >;
  }

  /**
   * Retrieves a specific database.
   * @param name name of the database.
   */
  db(name?: string) {
    return this.client.db(name ?? this.options.database);
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.disconnect();
  }

  /**
   * Defines or retrieves a model.
   * @param name name of the model.
   * @param schema schema of the model.
   * @param collection name of the collection (if not passed, plural form of `name` will be used).
   */
  model<T>(
    name: string,
    schema: mongoose.Schema<T>,
    collection?: string
  ): mongoose.Model<T> {
    const model = this.instance.models[name];
    if (model) return model;
    return this.instance.model<T>(name, schema, collection);
  }
}

/**
 * Available types that can be considered as a {@link Mongo} instance/bean.
 */
export type MongoBean = Class<Mongo> | Mongo | string;

/**
 * Creates a model with specific name using given {@link Mongo} type.
 * @param name name of the model.
 * @param schema schema of the model.
 * @param collection name of the collection (if not passed, plural form of `name` will be used).
 */
export function Model<TSchema extends mongoose.Schema = any>(
  name: string,
  schema: TSchema,
  collection?: string,
  options?: {
    /**
     * {@link Mongo} instance/bean to use.
     */
    use: MongoBean;
  }
) {
  if (!schema) {
    throw new Error(`Schema must be specified`);
  }
  const use = options?.use ?? Mongo;
  const model = () => {
    const mongo = use instanceof Mongo ? use : beanOf(use);
    return mongo.model(name, schema, collection) as TModel<TSchema>;
  };
  return new Proxy(
    function (...args: any[]) {
      return new (model())(...args);
    },
    {
      get: (_, key) => {
        if (key === 'use') {
          return (mongo: MongoBean = use) =>
            Model(name, schema, collection, { use: mongo });
        }
        return model()[key];
      },
    }
  ) as unknown as TModel<TSchema> & {
    /**
     * Uses another {@link Mongo} instance/bean if specified.
     */
    use: (mongo?: MongoBean) => TModel<TSchema>;
  };
}
