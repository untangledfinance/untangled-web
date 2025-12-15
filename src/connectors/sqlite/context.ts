import { EntityManager } from 'typeorm';
import { Context } from '../../core/context';

/**
 * Stores {@link EntityManager} of a SQLite transaction.
 */
export const SqliteEntityManagerContext = Context.for<EntityManager>(
  'SqliteEntityManagerContext'
);
