import { ObjectLiteral } from 'typeorm';

/**
 * Base entity class for SQLite entities.
 */
export class BaseEntity<T> {
  constructor(target?: Partial<T>) {
    if (target) {
      Object.assign(this, target);
    }
  }
}

/**
 * SQLite connection options.
 */
export type SqliteOptions = {
  database: string;
  migrationRoot?: string;
  enableWAL?: boolean;
  busyTimeout?: number;
};

/**
 * Model type (an Entity class).
 */
export type EntityType<T extends ObjectLiteral = ObjectLiteral> = {
  new (...args: any[]): T;
};

export type PropagationType = 'reuse' | 'new';
