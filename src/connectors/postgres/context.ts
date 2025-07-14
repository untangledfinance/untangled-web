import { EntityManager } from 'typeorm';
import { Context } from '../../core/context';

/**
 * Stores {@link EntityManager} of a Postgres transaction.
 */
export const EntityManagerContext = Context.for<EntityManager>(
  'EntityManagerContext'
);
