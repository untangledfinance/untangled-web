import bean from './bean';
import config from './config';

export { BootLoader } from './types';
export * from './hooks';

export {
  /**
   * Loads configurations to the global store.
   */
  config,
  /**
   * Initializes necessary beans.
   */
  bean,
};
