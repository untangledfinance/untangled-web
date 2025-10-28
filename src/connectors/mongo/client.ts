import mongoose from 'mongoose';
import { beanOf, OnInit, OnStop } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { noBigInt } from '../../core/types';
import { TModel } from './types';
import {
  attachAuditMiddleware,
  AuditOptions,
  DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX,
} from './audit';

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
  return setInterval(() => {
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
    const model = this.instance.model;
    this.instance.model = (
      name: string,
      schema: mongoose.Schema,
      collection: string,
      options: any
    ) => {
      const m = model.bind(this.instance)(name, schema, collection, options);
      const create = m.create;
      // converts all BigInt values to strings
      m.create = (...args: any[]) => create.bind(m)(...args.map(noBigInt));
      return m;
    };
    this.options = options;
  }

  /**
   * Checks if the associated connection is ready.
   */
  get connected() {
    return (
      this.instance.connection?.readyState ===
      mongoose.ConnectionStates.connected
    );
  }

  /**
   * Connects to the MongoDB server.
   */
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
      tls: tls === true,
      rejectUnauthorized: true,
    });
    this.logger.info('Connected');
  }

  /**
   * Disconnects from the MongoDB server.
   */
  protected async disconnect() {
    if (!this.connected) return;
    await this.instance.disconnect();
    this.logger.info('Disconnected');
  }

  /**
   * Retrieves a Mongo client.
   */
  get client() {
    if (!this.connected) throw new Error('Mongo instance not connected');
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
  options: {
    /**
     * {@link Mongo} instance/bean to use.
     */
    use?: MongoBean;
    /**
     * Audit trail configuration.
     */
    audit?: boolean | AuditOptions;
  } = {}
) {
  if (!schema) {
    throw new Error(`Schema must be specified`);
  }

  // Attach audit middleware if audit options are provided
  if (options.audit) {
    const auditCollection =
      (typeof options.audit === 'object'
        ? options.audit.auditCollection
        : undefined) ||
      `${collection || name.toLowerCase() + 's'}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;
    const auditOptions = {
      ...(typeof options.audit === 'object' ? options.audit : {}),
      auditCollection,
    };
    attachAuditMiddleware(schema, auditOptions);
  }

  const use = options.use ?? Mongo;
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
            Model(name, schema, collection, { ...options, use: mongo });
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
