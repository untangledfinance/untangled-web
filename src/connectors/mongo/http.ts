import qs from 'qs';

import { Mongo, MongoBean } from './client';
import { Controller, Get, Req } from '../../core/http';
import { beanOf } from '../../core/ioc';
import { num } from '../../core/types';
import { Auth } from '../../middlewares/auth';

class QueryParser {
  /**
   * Supported Mongo operators.
   */
  static readonly OPERATORS = {
    eq: '$eq',
    ne: '$ne',
    gt: '$gt',
    gte: '$gte',
    lt: '$lt',
    lte: '$lte',
    in: '$in',
  };

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
        const exprs = query.or
          .replace(/^\(|\)$/g, '') // remove parentheses
          .split(',')
          .map((expr) => {
            const [field, op, value] = expr.split('.');
            if (op === 'in') {
              return { [field]: { $in: value.split(',') } };
            } else {
              return {
                [field]: {
                  [this.OPERATORS[op]]: num(value) || value,
                },
              };
            }
          });
        filter.$or = exprs;
      } else if (typeof query[key] === 'object') {
        // field[gt]=10&field[lt]=100
        for (const op in query[key]) {
          if (op === 'in') {
            filter[key] = { ...filter[key], $in: query[key][op].split(',') };
          } else {
            filter[key] = {
              ...filter[key],
              [this.OPERATORS[op]]: num(query[key][op]) || query[key][op],
            };
          }
        }
      } else {
        // field=value
        filter[key] = num(query[key]) || query[key];
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
  class MongoController {
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
      const fitler = QueryParser.parse(
        qs.parse(new URLSearchParams(query).toString())
      );

      const [total, data] = await Promise.all([
        this.collection(collection).countDocuments(fitler),
        this.collection(collection)
          .find(fitler)
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
