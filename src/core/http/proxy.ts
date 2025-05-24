export type ProxyURL = string | URL;

export abstract class ProxyStore {
  /**
   * Retrieves a proxy URL for a specific key.
   * @param key the key.
   */
  abstract get(key: string): ProxyURL | Promise<ProxyURL>;
}

export type ProxyOptions = ProxyURL | Promise<ProxyURL> | ProxyStore;
