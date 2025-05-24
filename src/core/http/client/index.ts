import axios, { Axios, AxiosError, AxiosRequestConfig } from 'axios';

type HttpClientOptions = AxiosRequestConfig & {
  /**
   * Forces to return a {@link Response} instead of throwing an {@link AxiosError}.
   */
  doNotThrowError?: boolean;
};

/**
 * A simple HTTP client.
 */
export class HttpClient {
  protected readonly client: Axios;

  constructor(configs: HttpClientOptions = {}) {
    this.client = axios.create({
      ...configs,
      baseURL:
        configs.baseURL ??
        (process.env.PORT && `http://localhost:${process.env.PORT}`),
    });
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (configs.doNotThrowError) {
          return HttpClient.toResponse(err);
        }
        throw new AxiosError(err.message, err.code ?? 500);
      }
    );
  }

  /**
   * Converts a value into standard {@link Response}.
   * @param val the value.
   */
  static toResponse(val: any) {
    const {
      data = null,
      headers = {},
      status = 500,
      statusText = 'InternalServerError',
    } = (axios.isAxiosError(val) ? val.response : val) ?? {};
    return new Response(data, {
      headers,
      status,
      statusText,
    });
  }
}
