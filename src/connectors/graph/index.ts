import * as graphql from 'graphql-request';
import { Callable } from '../../core/types';

export type GraphOptions = {
  /**
   * Base URL of the GraphQL server.
   */
  url?: string;
  /**
   * API key to send requests to the GraphQL server.
   */
  apiKey?: string;
};

type Result<T = any> = {
  data: T;
};

type BatchResult = [Result, ...Result[]];

/**
 * A GraphQL client.
 */
export class Graph<R = any> extends Callable<Promise<R>> {
  public static readonly gql = graphql.gql;

  /**
   * Retrieves the URL of a Graph request with a given identifier.
   * @param id the identifier (default: configured identifier).
   */
  private readonly url: (id?: string) => string;
  /**
   * Retrieves the request headers to send to a Graph.
   * @param headers the headers content to override.
   */
  private readonly headers: (
    headers?: Record<string, string>
  ) => Record<string, string>;

  /**
   * Initializes a Graph with a given identifier.
   * @param id identifier of the graph.
   */
  constructor(
    private readonly id: string,
    options?: GraphOptions
  ) {
    super();
    const baseUrl = (
      options?.url || 'https://gateway.thegraph.com/api/subgraphs/id'
    ).replace(/\/+$/g, '');
    const apiKey = options?.apiKey;
    this.url = (id?: string) => baseUrl + '/' + (id || this.id);
    this.headers = (headers: Record<string, string> = {}) => ({
      Authorization: apiKey ? `Bearer ${apiKey}` : '',
      ...headers,
    });
  }

  override async _(document: graphql.RequestDocument, id?: string) {
    return this.send<R>(document, id);
  }

  /**
   * Sends a GraphQL request with a specific document.
   * @param document the GraphQL document.
   * @param id used identifier of the requested graph.
   */
  async send<T = R>(document: graphql.RequestDocument, id?: string) {
    return graphql.request<T>(this.url(id), document, {}, this.headers());
  }

  /**
   * Sends a batch of GraphQL requests with given documents.
   * @param documents the GraphQL documents.
   * @param id used identifier of the requested graph.
   */
  async batch<T extends BatchResult>(
    documents: graphql.BatchRequestDocument[],
    id?: string
  ) {
    return graphql.batchRequests<T>(this.url(id), documents, this.headers());
  }
}
