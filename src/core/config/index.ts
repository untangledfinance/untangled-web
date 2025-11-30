import fs from 'fs';
import { createLogger } from '../logging';
import { isString } from '../types';
import { Catch } from '../validation';

const logger = createLogger('config');

/**
 * A configuration store.
 */
export class ConfigStore {
  constructor(config?: any) {
    config && this.load(config);
  }

  /**
   * Loads configurations from a specific config source.
   * @param source the config source.
   */
  load(source: any) {
    if (!source) {
      throw new Error('invalid source');
    }
    for (const key of Object.keys(source)) {
      const value = source[key] as any;
      try {
        if (value instanceof String) {
          this[key] = JSON.parse(value as string);
          continue;
        }
      } catch {}
      this[key] = value;
    }
    return this;
  }

  /**
   * Loads a JSON to environment variables.
   * @param path path to the JSON file.
   */
  @Catch((err, path: string) => logger.error(`${err.message} (path: ${path})`))
  static loadEnvFromJson(path: string) {
    const envs = JSON.parse(fs.readFileSync(path).toString());
    for (const env in envs) {
      try {
        const val = envs[env];
        process.env[env] =
          val === undefined || val === null || isString(val)
            ? val
            : JSON.stringify(val);
      } catch (err) {
        logger.error(`Env processing failed: ${env} (path: '${path}')`);
      }
    }
  }
}

/**
 * Loads a JSON to environment variables.
 * @param path path to the JSON file.
 */
export const loadEnvFromJson = ConfigStore.loadEnvFromJson;

/**
 * The default {@link ConfigStore} which should be used globally.
 */
const Configs = new ConfigStore();

export default Configs;
