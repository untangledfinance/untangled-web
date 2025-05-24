import { Callable, notImplementedYet } from '../types';

/**
 * Supports notifications.
 */
export class NotifyConnector<Data = any, Dest = any> extends Callable<
  Promise<{
    ok: boolean;
  }>
> {
  override async _(data: Data | string, dest?: Dest | string) {
    return this.send(data, dest);
  }
  /**
   * Sends data to a destination.
   * @param data the text.
   * @param dest the destination.
   */
  async send(
    data: Data | string,
    dest?: Dest | string
  ): Promise<{
    /**
     * @returns `true` if data was sent successfully; otherwise, `false`.
     */
    ok: boolean;
  }> {
    throw notImplementedYet();
  }
}

/**
 * Sends notifications.
 */
export const Notify = NotifyConnector;
