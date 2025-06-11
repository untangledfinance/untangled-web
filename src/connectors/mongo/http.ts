import mongoose from 'mongoose';
import qs from 'qs';
import { Controller, Get, Group, Module } from '../../core/http';
import { beanOf } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { Action, isDecimal, num } from '../../core/types';
import { Auth, AuthReq } from '../../middlewares/auth';
import { Mongo, MongoBean } from './client';

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

/**
 * Uses {@link Mongo} via REST APIs.
 */
export function useMongoREST(
  options: Partial<{
    /**
     * {@link Mongo} instance/bean to use.
     */
    use: MongoBean;
    /**
     * Name of the database to use.
     */
    dbName?: string;
    /**
     * To skip {@link Auth}orization (default: false).
     */
    noAuth: boolean;
  }> = {}
) {
  const createCollectionAuthDecorator = (action: Action) => {
    if (options.noAuth) return () => {};
    return Auth((req) => {
      const collection = req.params.collection as string;
      return `${collection}:${action}`;
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
     * @param dbName name of the database.
     */
    collection(name: string) {
      const use = options?.use || Mongo;
      const mongo = use instanceof Mongo ? use : beanOf(use);
      return mongo.db(options?.dbName).collection(name);
    }

    /**
     * Retrieves a document of the given collection by the given `_id`.
     */
    @Get('/:collection/:id')
    @ViewAuth
    async findById(req: AuthReq): Promise<MongoViewHttpResponse> {
      const collection = req.params.collection as string;
      const id = req.params.id as string;
      return {
        data: await this.collection(collection).findOne({
          _id: new mongoose.Types.ObjectId(id),
        }),
      };
    }

    /**
     * Finds all documents that match the given filter.
     */
    @Get('/:collection')
    @ListAuth
    async find(req: AuthReq): Promise<MongoListHttpResponse> {
      const collection = req.params.collection as string;
      const { size, page, select = '*', ...query } = req.query || {};
      const pageSize = num(size) || 20;
      const pageNumber = num(page) || 0;
      const offset = pageSize * pageNumber;
      const { filter, order } = QueryParser.parse(
        qs.parse(query as Record<string, string>)
      );
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
      this.logger.debug(
        `Select ${fields} From "${collection}" Where ${JSON.stringify(filter)} Order by ${JSON.stringify(order)} Skip ${offset} Limit ${pageSize}`
      );

      const [total, data] = await Promise.all([
        this.collection(collection).countDocuments(filter),
        this.collection(collection)
          .find(filter, { projection })
          .sort(order)
          .skip(offset)
          .limit(pageSize)
          .toArray(),
      ]);

      return {
        metadata: {
          total,
          size: pageSize,
          page: pageNumber,
        },
        data,
      };
    }
  }

  @Module({
    controllers: [MongoController],
  })
  class MongoModule extends Group {}

  return {
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
