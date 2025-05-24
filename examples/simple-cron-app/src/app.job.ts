import { Cron, Job, Runner } from 'untangled-web/core/scheduling';
import { AppService } from './app.service';

@Job
export class AppJob extends Runner {
  private readonly appService: AppService;

  constructor() {
    super();
    this.appService = new AppService();
  }

  @Cron('*/1 * * * *')
  async printCurrentTimeEveryMinute() {
    const currentTime = await this.appService.getCurrentTime();
    console.log(currentTime);
  }
}
