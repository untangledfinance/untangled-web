import { Cron, Job, Runner } from 'untangled-web/core/scheduling';
import { Queue } from 'untangled-web/core/queue';
import { createLogger } from 'untangled-web/core/logging';

@Auto
@Job
export class AppJob extends Runner {
  private readonly queueId = 'queue1';
  private readonly logger = createLogger(AppJob.name);

  /**
   * Adds a message in the queue every 30 second.
   */
  @Cron('*/30 * * * * *')
  async queue() {
    await $(Queue).enqueue(this.queueId, `Hello, ${Date.now()}!`);
    this.logger.debug(`Message queued in ${this.queueId}`);
  }

  /**
   * Processes messages in the queue every 5 second.
   */
  @Cron('*/5 * * * * *')
  async dequeue() {
    const message = await $(Queue).dequeue(this.queueId);
    if (message) {
      this.logger.debug(`Message "${message}" in ${this.queueId} processed`);
    } else {
      this.logger.debug(`No message in ${this.queueId} now`);
    }
  }
}
