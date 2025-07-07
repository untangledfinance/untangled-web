import { Controller, Get, Request, type Req } from 'untangled-web/core/http';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService = new AppService()) {}

  @Request('/echo')
  async echo(req: Req) {
    return req;
  }

  @Get('/current-time')
  async currentTime() {
    return this.appService.getCurrentTime();
  }

  @Get('/error')
  async error() {
    throw new Error('Whoops!');
  }
}
