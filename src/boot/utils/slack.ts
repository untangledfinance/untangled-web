import { KnownBlock } from '@slack/web-api';
import { beanOf } from '../../core/ioc';
import { NotifyConnector } from '../../core/notify';
import { SlackConnector } from '../../connectors/notify';

/**
 * Returns the format of a {@link Date} as like `Nov 13 2023 19:23 UTC`.
 * @param date the {@link Date}.
 */
function prettyDate(date: Date) {
  return date
    .toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    })
    .replace(',', '')
    .concat(' (UTC)');
}

type MessageOptions = {
  /**
   * Channel Id.
   */
  channel?: string;
  /**
   * Thread Id.
   */
  thread?: string;
  /**
   * URL for the title's icon (in a Context block).
   */
  icon?: string;
  /**
   * Title (in a Context block).
   */
  title: string;
  /**
   * Header (in a Section block).
   */
  header?: string;
  /**
   * Description (in a Section block).
   */
  description?: string | string[];
};

/**
 * Builds Slack message blocks.
 */
export function messageBlocks(options: MessageOptions) {
  const now = new Date();
  const { title, icon, header, description } = options;
  const blocks = [
    title && {
      type: 'context',
      elements: [
        icon && {
          type: 'image',
          image_url: icon,
          alt_text: title,
        },
        {
          type: 'mrkdwn',
          text: title,
        },
      ].filter((e) => !!e),
    },
    header && {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: header,
      },
    },
    description && {
      type: 'section',
      fields: [description].flat().map((d) => ({
        type: 'mrkdwn',
        text: d,
      })),
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `<!date^${Math.ceil(now.getTime() / 1e3)}^{date_short_pretty} {time}|${prettyDate(now)}>`,
        },
      ],
    },
  ] as KnownBlock[];
  return blocks.filter((block) => !!block);
}

/**
 * Returns basic information of the application.
 */
export function useApp() {
  const appName = Configs.app.name;
  const appLink = Configs.app.url;
  const appRegistry = Configs.app.registry;
  const appVersion = Configs.app.version;
  const systemName = Configs.system.name;
  const systemIcon = Configs.app.icon;
  return {
    appName,
    appLink,
    appRegistry,
    appVersion,
    systemName,
    systemIcon,
  };
}

/**
 * Uses Slack for notifications.
 * @see SlackConnector
 */
export function useSlack() {
  const client = beanOf<SlackConnector>(NotifyConnector.name);
  const { systemName, systemIcon, ...app } = useApp();
  const appLink = `*<${app.appLink}|${app.appName}>*`;
  const appVersion = `*<${app.appRegistry}|${app.appVersion}>*`;
  return {
    /**
     * The default {@link SlackConnector} instance.
     */
    client,
    /**
     * To create notification structure following Slack formats.
     */
    builder: {
      /**
       * Creates message that matches Slack formats.
       */
      message: messageBlocks,
      /**
       * Data to be sent when the application starts.
       */
      started: (user = systemName) =>
        messageBlocks({
          title: `*${user}* started ${appLink}.`,
          icon: user === systemName && systemIcon,
          header: user === systemName && appVersion,
          description: user === systemName && ['*Status*\n~Stopped~ → Running'],
        }),
      /**
       * Data to be sent when the application stops.
       */
      stopped: (user = systemName) =>
        messageBlocks({
          title: `*${user}* stopped ${appLink}.`,
          icon: user === systemName && systemIcon,
          header: user === systemName && appVersion,
          description: user === systemName && ['*Status*\n~Running~ → Stopped'],
        }),
      /**
       * Data to be sent when a job is deleted.
       */
      jobDeleted: (options: {
        /**
         * User who deletes the job.
         */
        user: string;
        /**
         * Name of the job.
         */
        job: string;
      }) =>
        messageBlocks({
          title: `*${options.user}* deleted *${options.job}* in ${appLink}.`,
        }),
      /**
       * Data to be sent when a job is triggered.
       */
      jobTriggered: (options: {
        /**
         * User who triggers the job.
         */
        user: string;
        /**
         * Name of the job.
         */
        job: string;
      }) =>
        messageBlocks({
          title: `*${options.user}* triggered *${options.job}* in ${appLink}.`,
        }),
      /**
       * Data to be sent when a job starts.
       */
      jobStarted: (options: {
        /**
         * Name of the job.
         */
        job: string;
      }) =>
        messageBlocks({
          title: `*${options.job}* started in ${appLink}.`,
        }),
      /**
       * Data to be sent when a job finishes.
       */
      jobCompleted: (options: {
        /**
         * Name of the job.
         */
        job: string;
      }) =>
        messageBlocks({
          title: `*${options.job}* completed in ${appLink}.`,
        }),
      /**
       * Data to be sent when a job fails.
       */
      jobFailed: (options: {
        /**
         * Name of the job.
         */
        job: string;
        /**
         * Error.
         */
        error: Error;
      }) =>
        messageBlocks({
          title: `*${options.job}* failed in ${appLink}.`,
          header: 'Whoops!!',
          description: `\`\`\`${options.error?.stack}\`\`\``,
        }),
    },
    /**
     * Notifies to a group of members.
     * @param mentions an ID list of the members to notify.
     * @see client.send
     */
    send: async (
      options: Omit<MessageOptions, 'threadId'>,
      ...mentions: string[]
    ) => {
      const { ok, threadId } = (await client.send(
        messageBlocks({
          icon: options.icon,
          title: options.title,
          header: options.header,
          description: mentions.length ? '' : options.description,
        }),
        options.channel,
        options.thread
      )) as {
        ok: boolean;
        threadId?: string;
      };
      if (ok && mentions.length) {
        return (
          await client.send(
            messageBlocks({
              title: '',
              header: mentions.map((memberId) => `<@${memberId}>`).join(' '),
              description: options.description,
            }),
            options.channel,
            threadId
          )
        ).ok;
      }
      return ok;
    },
  };
}
