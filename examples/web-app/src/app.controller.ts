import { Controller, Get, Request, type Req } from 'untangled-web/core/http';
import { Log, Logger } from 'untangled-web/core/logging';
import { AppService } from './app.service';
import { ReqCache } from './app.util';

@Log
@Controller()
export class AppController {
  constructor(
    private readonly logger: Logger,
    private readonly appService = new AppService()
  ) {}

  @Request('/echo')
  async echo(req: Req) {
    return req;
  }

  @Get('/current-time')
  async currentTime() {
    return this.appService.getCurrentTime();
  }

  @Get('/protected-resource')
  async protectedResource() {
    return Promise.all([
      this.appService.getProtectedResource(),
      this.appService.getProtectedResource(),
      this.appService.getProtectedResource(),
    ]);
  }

  @Get('/error')
  async error() {
    throw new Error('Whoops!');
  }

  @Get('/cache')
  @ReqCache.Auto(5000)
  async cache() {
    this.logger.debug('Executing...');
    return {
      currentTime: await this.currentTime(),
    };
  }
}
