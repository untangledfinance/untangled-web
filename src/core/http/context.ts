import { Context } from '../context';
import { Req } from './core';

/**
 * Information relating to current HTTP {@link Req}uest.
 */
export const HttpContext = Context.for<{
  /**
   * Current HTTP {@link Req}uest.
   */
  req: Req;
}>('HttpContext');
