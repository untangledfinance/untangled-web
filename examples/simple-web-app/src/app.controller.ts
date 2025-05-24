import { Controller, Get } from 'untangled-web/core/http';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly appService: AppService;

  constructor() {
    this.appService = new AppService();
  }

  @Get('/current-time')
  async getCurrentTime() {
    return this.appService.getCurrentTime();
  }
}
