import qs from 'qs';
import {
  BadRequestError,
  Controller,
  Get,
  Group,
  HttpContext,
  Module,
  UnauthorizedError,
} from '../../core/http';
import { beanOf } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { PERM_ALL, permOf } from '../../core/rbac';
import { Action, flatten, isDecimal, num } from '../../core/types';
import { Auth, type AuthReq } from '../../middlewares/auth';
import { Mongo, MongoBean, SYSTEM_DATABASES } from './client';
import { ObjectId } from './types';

class QueryParser {
  /**
   * Supported Mongo operators.
   */
  private static readonly OPERATORS = {
    eq: '$eq',
    ne: '$ne',
    gt: '$gt',
    gte: '$gte',
    lt: '$lt',
    lte: '$lte',
    in: '$in',
    like: '$regex',
  };

  /**
   * Converts a value to its correct type in a heuristic way.
   * @param value the value.
   */
  private static typify(value: any) {
    if ([NaN, null].includes(value)) return null;
    if (typeof value === 'string' && value.startsWith('str:')) {
      return value.slice(4);
    }
    if (typeof value === 'string' && value.startsWith('id:')) {
      return new ObjectId(value.slice(3));
    }
    if ([true, false, 'true', 'false'].includes(value))
      return value === true || value === 'true';
    if (typeof value === 'number' || isDecimal(value as string))
      return Number(value);
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    ) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    return value; // String, Array, Object
  }

  /**
   * Parses a single OR expression into field, operator, value.
   * Handles cases like asset.price.gt.10 and score.lt.(10.5)
   */
  private static parseOrExpression(
    expression: string
  ): { field: string; operator: string; value: any } | null {
    // Match: field(.fieldN)*.operator.value or value in parenthesis
    // e.g. asset.price.gt.10 or score.lt.(10.5)
    //      field: asset.price    operator: gt    value: 10
    //      field: score          operator: lt    value: 10.5
    const re = /^(.+?)\.(eq|ne|gt|gte|lt|lte|in|like)\.(\(.+\)|.+)$/;
    const m = expression.match(re);
    if (!m) return null;
    const [, field, operator, value] = m;
    let parsedValue = value;
    // Remove parentheses for numbers like (10.5)
    if (/^\(.+\)$/.test(value)) {
      parsedValue = value.slice(1, -1);
    }
    return { field, operator, value: parsedValue };
  }

  /**
   * Splits a string on commas that are not inside parenthesis.
   * e.g. "(a.b.gt.1,score.lt.(10.5),foo.eq.bar)" => [...]
   */
  private static splitTopLevelComma(str: string): string[] {
    const result: string[] = [];
    let buf = '';
    let paren = 0;
    for (let i = 0; i < str.length; ++i) {
      const c = str[i];
      if (c === '(') paren++;
      if (c === ')') paren--;
      if (c === ',' && paren === 0) {
        result.push(buf);
        buf = '';
      } else {
        buf += c;
      }
    }
    if (buf) result.push(buf);
    return result.map((x) => x.trim()).filter(Boolean);
  }

  /**
   * Converts a search query into a respective Mongo filter.
   * @param query the search query.
   */
  static parse(query: Record<string, any>) {
    const filter = {} as Record<string, any>;
    const order = {} as Record<string, any>;

    for (const key in query) {
      if (key === 'or') {
        // or=(asset.price.gt.10,score.lt.(10.5))
        // => {$or: [ {'asset.price': {$gt: 10}}, {score: {$lt: 10.5}} ]}
        const orStr = (query.or as string).replace(/^\(|\)$/g, '');
        const expressions = this.splitTopLevelComma(orStr)
          .map((expression) => {
            const parsed = this.parseOrExpression(expression);
            if (!parsed) return null;
            const { field, operator, value } = parsed;
            if (operator === 'in') {
              return {
                [field]: {
                  $in: value.split(',').map(this.typify),
                },
              };
            } else if (operator === 'like') {
              return {
                [field]: {
                  $regex: this.typify(value),
                  $options: 'i',
                },
              };
            } else {
              return {
                [field]: {
                  [this.OPERATORS[operator]]: this.typify(value),
                },
              };
            }
          })
          .filter(Boolean);
        filter.$or = expressions;
      } else if (typeof query[key] === 'object') {
        for (const operator in query[key]) {
          // order[asc]=field1&order[desc]=field2,field3
          // => {field1: 'asc', field2: 'desc', field3: 'desc'}
          if (key === 'order' && ['asc', 'desc'].includes(operator)) {
            for (const field of (query[key][operator] as string).split(',')) {
              order[field] = operator;
            }
            continue;
          }
          if (operator === 'in') {
            // field[in]=1,2,3
            // => {field: {$in: [1, 2, 3]}}
            filter[key] = {
              ...filter[key],
              $in: (query[key][operator] as string).split(',').map(this.typify),
            };
          } else if (operator === 'like') {
            filter[key] = {
              ...filter[key],
              $regex: query[key][operator] as string,
              $options: 'i',
            };
          } else {
            // field[gt]=10&field[lt]=100
            // => {field: {$gt: 10, $lt: 100}}
            filter[key] = {
              ...filter[key],
              [this.OPERATORS[operator]]: this.typify(query[key][operator]),
            };
          }
        }
      } else {
        // field=value
        // => {field: 'value'}
        filter[key] = this.typify(query[key]);
      }
    }

    return { filter, order };
  }
}

/**
 * Response type for the REST {@link Mongo} list query.
 */
export type MongoListHttpResponse<T = any> = {
  /**
   * Contains paginated matching documents of the query.
   */
  data: T[];
  /**
   * Metadata of the query.
   */
  metadata: {
    /**
     * The number of matching documents in all pages.
     */
    total: number;
    /**
     * The current page.
     */
    page: number;
    /**
     * Size of the current page.
     */
    size: number;
  };
};

/**
 * Response type for the REST {@link Mongo} document details query.
 */
export type MongoViewHttpResponse<T = any> = {
  /**
   * The document details if available; otherwise, `undefined`.
   */
  data: T | undefined;
};

export type MongoHttpOptions = Partial<{
  /**
   * {@link Mongo} instance/bean to use.
   */
  use: MongoBean;
  /**
   * Name of the database(s) to use.
   */
  dbName: string | string[];
  /**
   * Authorization options.
   */
  auth: Partial<{
    /**
     * To skip {@link Auth}orization for specific collections (or all collections if `true`).
     * If specific collections are passed, `auth.allowAnonymous` will be always `true`.
     */
    noAuth: boolean | string | string[];
    /***
     * Accepts no-auth {@link Req}uests. If `auth.noAuth` is passed, it will be always `true`.
     */
    allowAnonymous: boolean;
  }>;
}>;

/**
 * Uses {@link Mongo} via REST APIs.
 */
export function useMongoREST(options: MongoHttpOptions = {}) {
  const getMongo = () => {
    const use = options.use || Mongo;
    return use instanceof Mongo ? use : beanOf(use);
  };

  const createCollectionAuthDecorator = (action: Action) => {
    const noAuthCollections = [] as string[];
    if (options.auth?.noAuth) {
      if (typeof options.auth.noAuth === 'boolean') return () => {};
      noAuthCollections.push(
        ...[options.auth.noAuth].flat().filter((collection) => !!collection)
      );
    }
    const auth =
      noAuthCollections.length || options.auth?.allowAnonymous
        ? Auth.AllowAnonymous
        : Auth;
    return auth((req) => {
      const collection = req.params.collection as string;
      if (noAuthCollections.includes(collection)) return;
      return permOf(collection, action);
    });
  };

  const ViewAuth = createCollectionAuthDecorator('view');
  const ListAuth = createCollectionAuthDecorator('list');

  @Controller()
  @Log
  class MongoController {
    readonly logger: Logger;

    /**
     * Retrieves the instance of the given collection.
     * @param name name of the collection.
     * @param db name of the database.
     */
    collection(name: string, db?: string) {
      const dbNames = [options.dbName].flat();

      if (db) {
        try {
          if (SYSTEM_DATABASES.includes(db)) {
            throw new Error(
              `System database not supported by MongoREST: ${db}`
            );
          }

          if (dbNames.length && !dbNames.includes(db)) {
            throw new Error(`Database not supported: ${db}`);
          }

          const { req } = HttpContext.getOrThrow();
          const perms = (req as AuthReq)?._auth?.perms ?? [];
          if (
            !perms.includes(PERM_ALL) &&
            !perms.includes(permOf('db')) &&
            !perms.includes(permOf('db', db))
          ) {
            throw new Error(`Access denied to database: ${db}`);
          }
        } catch (err) {
          this.logger.error(err.message);
          throw new UnauthorizedError();
        }
      }
      const mongo = getMongo();
      const dbName = db || dbNames.at(0);
      const database = mongo.db(dbName);
      const col = database.collection(name);
      return col;
    }

    /**
     * Returns a {@link Response} that attaches a CSV file
     * for downloading the given data.
     * @param name name of the CSV file.
     * @param data the downloading data.
     * @param columns columns in the CSV file.
     */
    csv<T>(name: string, data: T[], ...columns: string[]): Response {
      if (!columns.length) {
        throw new BadRequestError('Must select columns to export');
      }

      let content = '';
      for (const column of columns) {
        content += column.includes(',') ? `"${column}",` : `${column},`;
      }
      content += '\n';
      for (const doc of data) {
        const values = flatten<Record<string, any>>(doc, 10, (val) => {
          if (val instanceof Date) {
            return val.toISOString();
          }
          if (val instanceof ObjectId) {
            return val.toHexString();
          }
          return val;
        });
        for (const column of columns) {
          const value = values[column];
          if (value === undefined) {
            content += ',';
          } else {
            content += `${value}`.includes(',') ? `"${value}",` : `${value},`;
          }
        }
        content += '\n';
      }

      return new Response(
        new File([content], name.endsWith('.csv') ? name : `${name}.csv`, {
          type: 'text/csv',
        }),
        {
          headers: new Headers({
            'content-type': 'text/csv',
          }),
        }
      );
    }

    /**
     * Extracts from a text all fields to select in the query.
     * @param select the text.
     */
    toFields(select = '*') {
      const fields = (select as string)
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field !== '');

      const projection =
        !fields.length || fields.includes('*')
          ? undefined // select all
          : fields.reduce(
              (project, field) => ({
                ...project,
                [field]: true,
              }),
              {} as {
                [field: string]: boolean;
              }
            );

      if (projection) {
        projection['_id'] = !!projection['_id'];
      }

      return {
        /**
         * Projection to use.
         */
        projection,
        /**
         * Selected fields.
         */
        fields,
      };
    }

    /**
     * Retrieves a document of the given collection by the given `_id`.
     */
    @Get('/:collection/:id')
    @ViewAuth
    async findById(req: AuthReq) {
      const collection = req.params.collection as string;
      const id = req.params.id as string;
      const { select = '*', format, db } = req.query || {};
      const { fields, projection } = this.toFields(select as string);
      this.logger.debug(
        `[${db}] Select ${fields} From "${collection}" Where Id='${id}'`
      );

      const data = await this.collection(collection, db as string).findOne(
        {
          _id: new ObjectId(id),
        },
        { projection }
      );

      if (format === 'csv' && fields.length) {
        const fileName = `${collection}_${id}_${Date.now()}.csv`;
        return this.csv(fileName, [data], ...fields);
      }

      return {
        data,
      } as MongoViewHttpResponse;
    }

    /**
     * Finds all documents that match the given filter.
     */
    @Get('/:collection')
    @ListAuth
    async find(req: AuthReq) {
      const collection = req.params.collection as string;
      const {
        size,
        page,
        select = '*',
        format,
        db,
        ...query
      } = req.query || {};
      const pageSize = num(size) || 20;
      const pageNumber = num(page) || 0;
      const offset = Math.max(pageSize, 0) * Math.max(pageNumber, 0);

      const { filter, order } = QueryParser.parse(
        qs.parse(query as Record<string, string>)
      );

      const { fields, projection } = this.toFields(select as string);
      this.logger.debug(
        `[${db}] Select ${fields} From "${collection}" Where ${JSON.stringify(filter)} Order by ${JSON.stringify(order)} Skip ${offset} Limit ${pageSize}`
      );

      const col = this.collection(collection, db as string);

      const [total, data] = await Promise.all([
        col.countDocuments(filter),
        col
          .find(filter, { projection })
          .sort(order)
          .skip(offset)
          .limit(pageSize > 0 && pageSize)
          .toArray(),
      ]);

      if (format === 'csv' && fields.length) {
        const fileName = `${collection}_p${page}_s${offset}_${Date.now()}.csv`;
        return this.csv(fileName, data, ...fields);
      }

      return {
        metadata: {
          total,
          size: pageSize,
          page: pageNumber,
        },
        data,
      } as MongoListHttpResponse;
    }
  }

  @Module({
    controllers: [MongoController],
  })
  class MongoModule extends Group {}

  return {
    /**
     * Returns the associated {@link Mongo} instance.
     * @throws an {@link Error} if not found.
     */
    getMongo,
    /**
     * A {@link Mongo} REST {@link Controller}.
     */
    MongoController,
    /**
     * A {@link Mongo} REST {@link Module}.
     */
    MongoModule,
  };
}
