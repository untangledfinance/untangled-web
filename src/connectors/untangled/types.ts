import { Axios } from 'axios';

type QueryField<T = any> = keyof T;

/**
 * @private Abstract type of an {@link Untangled} extension.
 */
export interface UntangledApiType<T = any> {
  new (client: Axios): T;
}

export type UntangledQueryOptions<T = any> = {
  /**
   * Fields to include in the query data (default: all fields).
   */
  select?: QueryField<T> | QueryField<T>[];
  /**
   * Filters following MongoREST query format.
   */
  where?:
    | {
        [key: string]: any;
      }
    | {
        [key in QueryField<T>]: T[key];
      };
  /**
   * Sorting by fields.
   */
  order?: {
    [key in QueryField<T>]?: 'desc' | 'asc';
  };
  /**
   * Page number (default: 0).
   */
  page?: number;
  /**
   * Maximum number of documents per page (default: 20).
   */
  size?: number;
};

export type UntangledQueryResponse<T = any> = {
  /**
   * Metadata of the query request.
   */
  metadata: {
    /**
     * Maximum number of documents that match the query.
     */
    total: number;
    /**
     * Current page number.
     */
    page: number;
    /**
     * Size of each page.
     */
    size: number;
  };
  /**
   * Documents that match the query in the current page.
   */
  data: T[];
};
