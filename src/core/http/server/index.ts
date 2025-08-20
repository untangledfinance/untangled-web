import { notImplementedYet } from '../../types';
import { Router, Server } from '../core';
import * as express from './express';

/**
 * Types of the embedded HTTP Server.
 */
enum ServerType {
  Express = 'express',
}

/**
 * Returns specific embedded HTTP Server's resources.
 * @param type type of the embedded HTTP Server.
 * @throws an error if the embedded HTTP Server type is unsupported.
 */
function useServer(type: ServerType = ServerType.Express): {
  Application: AbstractClass<Server>;
  Group: AbstractClass<Router>;
} {
  switch (type) {
    case ServerType.Express:
      return {
        Application: express.Application,
        Group: express.Group,
      };
    default:
      throw notImplementedYet();
  }
}

const server = useServer(process.env.EMBEDDED_SERVER as ServerType);

/**
 * Entry of the HTTP Server.
 */
export const Application = server.Application as Class<Server>;
/**
 * Routes of the HTTP Server.
 */
export const Group = server.Group as Class<Router>;
