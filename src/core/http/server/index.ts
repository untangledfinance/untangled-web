import { Router, Server } from '../core';
import * as bun from './bun';

/**
 * Entry of the HTTP Server.
 */
export const Application = bun.Application as unknown as Class<Server>;

/**
 * Routes of the HTTP Server.
 */
export const Group = bun.Group as unknown as Class<Router>;
