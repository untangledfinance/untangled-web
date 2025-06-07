import qs from 'qs';
import { Controller, Get, Req } from '../../core/http';
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
        // field[gt]=10&field[lt]=100
        for (const operator in query[key]) {
          if (operator === 'in') {
            filter[key] = {
              ...filter[key],
              $in: (query[key][operator] as string).split(',').map(this.typify),
            };
          } else {
            filter[key] = {
              ...filter[key],
              [this.OPERATORS[operator]]: this.typify(query[key][operator]),
            };
          }
        }
      } else {
        // field=value
        filter[key] = this.typify(query[key]);
      }
    }

    return filter;
  }
}

/**
 * Creates a REST {@link Controller} for the given {@link Mongo} instance/bean.
 * @param use {@link Mongo} instance/bean to use.
 */
export function createController(use: MongoBean = Mongo) {
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
      const collection = req.params.collection as string;
      return `${collection}:view`;
    })
    async findById(req: Req) {
      const collection = req.params.collection as string;
      const id = req.params.id as string;
      return {
        data: await this.collection(collection).findOne({
          // @ts-expect-error
          _id: id,
        }),
      };
    }

    /**
     * Finds all documents that match the given filter.
     */
    @Get('/:collection')
    @Auth((req) => {
      const collection = req.params.collection as string;
      return `${collection}:view`;
    })
    async find(req: Req) {
      const collection = req.params.collection as string;
      const { size, page, ...query } = req.query || {};
      const pageSize = num(size) || 20;
      const pageNumber = num(page) || 0;
      const offset = pageSize * pageNumber;
      const filter = QueryParser.parse(
        qs.parse(query as Record<string, string>)
      );
      this.logger.debug(`Parsed filter: ${JSON.stringify(filter)}`);

      const [total, data] = await Promise.all([
        this.collection(collection).countDocuments(filter),
        this.collection(collection)
          .find(filter)
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

  return MongoController;
}
