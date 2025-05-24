import { HttpMethod, StatusCode } from './core';

/**
 * A base class that represents an error when handling an HTTP request.
 */
export class HttpError extends Error {
  /**
   * The expected response status code.
   */
  statusCode: number;
  /**
   * The error code.
   */
  code?: string;
  /**
   * The asscociated request method.
   */
  method?: HttpMethod;
  /**
   * The request path.
   */
  path?: string;

  constructor(
    statusCode: number,
    message?: string,
    code?: string,
    method?: HttpMethod,
    path?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.method = method;
    this.path = path;
  }
}

/**
 * `404 - Not Found` error.
 */
export class NotFoundError extends HttpError {
  constructor(
    message?: string,
    code?: string,
    method?: HttpMethod,
    path?: string
  ) {
    super(StatusCode.NotFound, message ?? 'Not Found', code, method, path);
  }
}

/**
 * `400 - Bad Request` error.
 */
export class BadRequestError extends HttpError {
  constructor(
    message?: string,
    code?: string,
    method?: HttpMethod,
    path?: string
  ) {
    super(StatusCode.BadRequest, message ?? 'Bad Request', code, method, path);
  }
}

/**
 * `401 - Unauthorized` error.
 */
export class UnauthorizedError extends HttpError {
  constructor(
    message?: string,
    code?: string,
    method?: HttpMethod,
    path?: string
  ) {
    super(
      StatusCode.Unauthorized,
      message ?? 'Unauthorized',
      code,
      method,
      path
    );
  }
}

/**
 * `429 - Too Many Requests` error.
 */
export class TooManyRequestsError extends HttpError {
  constructor(
    message?: string,
    code?: string,
    method?: HttpMethod,
    path?: string
  ) {
    super(
      StatusCode.TooManyRequests,
      message ?? 'TooManyRequests',
      code,
      method,
      path
    );
  }
}
