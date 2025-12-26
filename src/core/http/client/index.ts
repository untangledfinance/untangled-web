import axios, {
  Axios,
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';

type HttpRequestOptions = AxiosRequestConfig;

type HttpClientOptions = HttpRequestOptions & {
  /**
   * Forces to return a {@link Response} instead of throwing
   * an {@link AxiosError} on error.
   */
  silent?: boolean;
};

/**
 * A simple HTTP client.
 */
export class HttpClient {
  protected readonly client: Axios;

  constructor(options: HttpClientOptions = {}) {
    const fallback = {
      host: Bun.env.HOST || 'localhost',
      port: Bun.env.PORT || '3000',
    };
    const fallbackURL = `http://${fallback.host}:${fallback.port}`;
    this.client = axios.create({
      ...options,
      baseURL: options.baseURL || fallbackURL,
    });
    this.client.interceptors.response.use(
      (res) => res,
      (err) => HttpClient.onError(err, options.silent)
    );
  }

  /**
   * Sends an HTTP request.
   * @param options the request options.
   */
  async request(options: HttpRequestOptions): Promise<Response> {
    const res = await this.client.request(options);
    return HttpClient.toResponse(res);
  }

  /**
   * Creates an {@link HttpClient}.
   */
  static create(options?: HttpClientOptions) {
    return new HttpClient(options);
  }

  /**
   * Handles a given error thrown when sending an HTTP request.
   * @param err the error.
   * @param silent to force to return a {@link Response}.
   * @throws the error if not handling in silence.
   */
  protected static onError(err: any, silent?: boolean) {
    if (silent) {
      if (axios.isAxiosError(err)) {
        return HttpClient.toResponse(err.response, 500);
      }
      return HttpClient.toResponse(err?.message, 500);
    }
    throw err;
  }

  /**
   * Converts an {@link AxiosResponse} into the standard {@link Response}.
   * @param res the {@link AxiosResponse} or the response text.
   * @param defaultStatus the default status code to respond (default: 200).
   */
  static toResponse(
    res?: AxiosResponse | string | Response,
    defaultStatus = 200
  ): Response {
    if (res instanceof Response) return res;

    if (!res || typeof res === 'string') {
      return new Response(res as string, {
        status: defaultStatus,
      });
    }

    const headers = new Headers();
    Object.entries(res.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, String(v)));
      } else if (value !== undefined) {
        headers.set(key, String(value));
      }
    });

    let body: BodyInit | null = null;
    if (res.data !== null && res.data !== undefined) {
      if (typeof res.data === 'string') {
        body = res.data;
      } else if (res.data instanceof ArrayBuffer) {
        body = res.data;
      } else if (res.data instanceof Blob) {
        body = res.data;
      } else if (res.data instanceof FormData) {
        body = res.data;
      } else {
        body = JSON.stringify(res.data);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }

    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: headers,
    });
  }
}
