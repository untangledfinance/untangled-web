import config from './config';
import bean from './bean';

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
