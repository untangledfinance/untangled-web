import fs from 'fs';
import path from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createLogger } from '../../core/logging';

const logger = createLogger('postgres');

/**
 * Utilities for Postgres migrations.
 */
export class Migrations {
  /**
   * Creates {@link MigrationInterface}s by reading contents of all migration files.
   * @param rootDir the root directory that contains migration files.
   */
  static from(
    rootDir: string,
    options?: Partial<{
      /**
       * Shows migration executions.
       */
      debug: boolean;
      /**
       * Name of the migration file (default: migration.sql).
       */
      migrationFileName: string;
      /**
       * Name of the clean file (default: clean.sql).
       */
      cleanFileName: string;
    }>
  ): Class<MigrationInterface>[] {
    if (!rootDir || !fs.existsSync(rootDir)) return [];
    const migrations: Class<MigrationInterface>[] = [];
    const migrationDirs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory());
    for (const dir of migrationDirs) {
      const migrationPath = path.join(
        rootDir,
        dir.name,
        options?.migrationFileName || 'migration.sql'
      );
      const cleanPath = path.join(
        rootDir,
        dir.name,
        options?.cleanFileName || 'clean.sql'
      );
      let migrationSql = '';
      let cleanSql = '';
      if (fs.existsSync(migrationPath)) {
        migrationSql = fs.readFileSync(migrationPath).toString();
      }
      if (fs.existsSync(cleanPath)) {
        cleanSql = fs.readFileSync(cleanPath).toString();
      }
      migrations.push(
        class implements MigrationInterface {
          name = dir.name;
          public async up(runner: QueryRunner) {
            if (migrationSql) {
              options?.debug && logger.debug(`Migrating ${dir.name}...`);
              await runner.query(migrationSql);
              options?.debug && logger.debug(`${dir.name} migrated`);
            }
          }
          public async down(runner: QueryRunner) {
            if (cleanSql) {
              options?.debug && logger.debug(`Cleaning ${dir.name}...`);
              await runner.query(cleanSql);
              options?.debug && logger.debug(`${dir.name} cleaned`);
            }
          }
        }
      );
    }
    options?.debug && logger.debug(`${migrations.length} migrations found`);
    return migrations;
  }
}
