import { ErrorCode, KnownBlock, WebClient } from '@slack/web-api';
import { Logger, createLogger } from '../../core/logging';
import { NotifyConnector } from '../../core/notify';
import { isString } from '../../core/types';

/**
 * Slack Notification Connector.
 */
export class SlackConnector extends NotifyConnector<KnownBlock[], string> {
  private readonly logger: Logger;
  private readonly client: WebClient;
  private readonly defaultChannelId: string;

  constructor(oauthToken: string, defaultChannelId?: string) {
    super();
    this.logger = createLogger(SlackConnector.name);
    this.client = new WebClient(oauthToken);
    this.defaultChannelId = defaultChannelId;
  }

  override async send(
    data: KnownBlock[] | string,
    channelId?: string,
    threadId?: string
  ) {
    try {
      const channel = channelId ?? this.defaultChannelId;
      const { ok, message, ts } = await this.client.chat.postMessage({
        text: isString(data) && data,
        blocks: !isString(data) && data,
        channel,
        thread_ts: threadId,
      });
      this.logger.info(`Message sent`, {
        channel,
        thread: ts,
      });
      return {
        ok,
        message,
        threadId: ts,
      };
    } catch (err) {
      if (err.code === ErrorCode.PlatformError) {
        return err.data as {
          ok: boolean;
          error: string;
        };
      } else {
        this.logger.error(`${err.message}\n`, err);
      }
      return {
        ok: false,
      };
    }
  }
}
