import mongoose from 'mongoose';
import qs from 'qs';
import { Controller, Get, Group, Module, Req } from '../../core/http';
import { beanOf } from '../../core/ioc';
import { Log, Logger } from '../../core/logging';
import { isDecimal, num } from '../../core/types';
import { Auth } from '../../middlewares/auth';
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
    if ([true, false, 'true', 'false'].includes(value)) return Boolean(value);
    if (typeof value === 'number' || isDecimal(value as string))
      return Number(value);
    return value; // String, Array, Object
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
        // or=(price.gt.10,quantity.lt.5)
        // => {$or: [ {price: {$gt: 10}}, {quantity: {$lt: 5}} ]}
        const expressions = (query.or as string)
          .replace(/^\(|\)$/g, '') // remove parentheses
          .split(',')
          .map((expression) => {
            const [field, operator, value] = expression.split('.');
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
          });
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
 * Creates a REST {@link Module} for the given {@link Mongo} instance/bean.
 * @param use {@link Mongo} instance/bean to use.
 * @param noAuth to skip authorization (default: false).
 */
export function useModule(use: MongoBean = Mongo, noAuth = false) {
  @Controller()
  @Log
  class MongoController {
    readonly logger: Logger;

    /**
     * Retrieves the instance of the given collection.
     * @param name name of the collection.
     */
    collection(name: string) {
      const mongo = use instanceof Mongo ? use : beanOf(use);
      return mongo.db().collection(name);
    }

    /**
     * Retrieves a document of the given collection by the given `_id`.
     */
    @Get('/:collection/:id')
    @Auth((req) => {
      if (noAuth) return;
      const collection = req.params.collection as string;
      return `${collection}:view`;
    })
    async findById(req: Req): Promise<MongoViewHttpResponse> {
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
    @Auth((req) => {
      if (noAuth) return;
      const collection = req.params.collection as string;
      return `${collection}:view`;
    })
    async find(req: Req): Promise<MongoListHttpResponse> {
      const collection = req.params.collection as string;
      const { size, page, select = '*', ...query } = req.query || {};
      const pageSize = num(size) || 20;
      const pageNumber = num(page) || 0;
      const offset = pageSize * pageNumber;
      const { filter, order } = QueryParser.parse(
        qs.parse(query as Record<string, string>)
      );
      const fields = (select as string).split(',');
      const projection = fields.includes('*')
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
        data,
        metadata: {
          total,
          size: pageSize,
          page: pageNumber,
        },
      };
    }
  }

  @Module({
    controllers: [MongoController],
  })
  class MongoModule extends Group {}

  return {
    MongoController,
    MongoModule,
  };
}
