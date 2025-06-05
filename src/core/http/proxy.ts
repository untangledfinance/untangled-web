export type ProxyURL = string | URL;
export type ProxyURLResolver =
  | ProxyURL
  | Promise<ProxyURL>
  | (() => ProxyURL)
  | (() => Promise<ProxyURL>);

export abstract class ProxyStore {
  /**
   * Retrieves a proxy URL for a specific key.
   * @param key the key.
   */
  abstract get(key: string): ProxyURLResolver;
}

export type ProxyOptions = ProxyURLResolver | ProxyStore;
