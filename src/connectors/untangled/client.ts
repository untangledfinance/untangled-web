import { Axios } from 'axios';
import { HttpClient } from '../../core/http';
import {
  UntangledApiType,
  UntangledQueryOptions,
  UntangledQueryResponse,
} from './types';

/**
 * Base URL of Untangled REST APIs (production).
 */
export const UNTANGLED_API_BASE_URL = 'https://api.untangled.finance';

/**
 * Functionalities to easily interact with the Untangled REST APIs.
 */
export class Untangled extends HttpClient {
  constructor() {
    super({
      baseURL: process.env.UNTANGLED_API_BASE_URL || UNTANGLED_API_BASE_URL,
    });
  }

  /**
   * Uses an Untangled REST APIs extension.
   * @param api type of the extension.
   * @see Api.
   */
  as<T extends Api>(api: UntangledApiType<T>): T {
    return new api(this.client);
  }

  /**
   * Returns `true` if the Untangled REST APIs are ready to
   * serve requests; otherwise, `false`. It basically sends
   * an HTTP request to the `/` endpoint and expects an `OK`
   * response.
   */
  async alive() {
    try {
      const res = await this.client.get('/');
      return res.statusText === 'OK';
    } catch {
      return false;
    }
  }

  /**
   * Queries data via the exposed Untangled MongoREST API.
   * @param collection name of the collection to query.
   */
  async query<T>(
    collection: string,
    options?: UntangledQueryOptions<T>
  ): Promise<UntangledQueryResponse<T>> {
    const select = [options?.select || '*'].flat();
    const where = options?.where || {};
    const order = Object.entries(
      (options?.order as Record<string, string>) || {}
    ).reduce(
      (o, [k, d]) => ({
        ...o,
        [d]: [...o[d], k],
      }),
      {
        desc: [],
        asc: [],
      }
    );
    const page = Math.max(options?.page || 0, 0);
    const size = Math.max(options?.size || 20, 20);
    const search = [
      `select=${select.join(',')}`,
      ...Object.entries(where).map(([k, v]) => `${k}=${v}`),
      order.desc.length && `order[desc]=${order.desc.join(',')}`,
      order.asc.length && `order[asc]=${order.asc.join(',')}`,
      `page=${page}`,
      `size=${size}`,
    ]
      .flat()
      .filter((v) => !!v)
      .join('&');
    return (
      await this.client.get<UntangledQueryResponse<T>>(
        `/_data/${collection}?${search}`
      )
    ).data;
  }
}

/**
 * Abstract type of an {@link Untangled} extension. The extension can
 * inherits all {@link Untangled}'s configurations if it is attached
 * via the {@link Untangled.as} method.
 */
export abstract class Api {
  /**
   * Initializes with a given {@link Axios} instance.
   */
  constructor(protected readonly client: Axios) {}
}
