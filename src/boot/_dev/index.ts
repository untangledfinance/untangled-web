import { CacheStore } from '../../core/caching';
import { Controller, Delete, Get, Post, Req, Request } from '../../core/http';
import { beanOf, beans, destroy, restart, shutdown } from '../../core/ioc';
import { Publisher } from '../../core/pubsub';
import { Runner, Runners } from '../../core/scheduling';
import { When } from '../../core/validation';
import { Auth, AuthReq } from '../../middlewares/auth';
import { RateLimit } from '../../middlewares/rate-limit';
import { useAppInfo } from '../utils/app';
import { clientIP, isDev } from '../utils/http';
import { useSlack } from '../utils/slack';

/**
 * Exposes endpoints for health-checking.
 */
@Controller()
export class HealthController {
  @Request('/healthz', {
    produces: 'text/plain',
  })
  async ping() {
    return 'Alive!!';
  }
}

/**
 * Exposes endpoints for management.
 */
@Controller()
export class AdminController {
  private get cacheStore() {
    return beanOf.type(CacheStore)(CacheStore.name);
  }

  private get publisher() {
    return beanOf(Publisher);
  }

  @Get('/_bean')
  @Auth('bean:list')
  async beans() {
    return Object.keys(beans());
  }

  @Get('/_job')
  @Auth('job:list')
  async listJobs() {
    return Object.entries(beans((_, bean) => bean instanceof Runner)).reduce(
      (jobMap, [jobName, bean]) => {
        const tasks = Runners.getTasks(bean as Runner);
        return {
          ...jobMap,
          [jobName]: Object.entries(tasks).reduce(
            (taskMap, [taskName, cron]) => ({
              ...taskMap,
              [taskName]: cron.cronTime.toJSON().join(' '),
            }),
            {} as Record<string, string>
          ),
        };
      },
      {} as Record<string, Record<string, string>>
    );
  }

  @Post('/_job/:name/restart')
  @Auth('job:restart')
  async restartJob(req: AuthReq) {
    const name = req.params.name as string;
    restart(Runner, name);
  }

  @Delete('/_job/:name')
  @Auth('job:delete')
  async deleteJob(req: AuthReq) {
    const name = req.params.name as string;
    destroy(Runner, name);
    const { client, builder } = useSlack();
    await client.send(
      builder.jobDeleted({
        user: req._auth.email,
        job: name,
      })
    );
  }

  @Post('/_job/:name')
  @Auth('job:execute')
  async executeJob(req: AuthReq) {
    const name = req.params.name as string;
    const job = beanOf.type(Runner)(name);
    const { client, builder } = useSlack();
    await client.send(
      builder.jobTriggered({
        user: req._auth.email,
        job: name,
      })
    );
    await job.run();
  }

  @Get('/_cache')
  @Auth('cache:list')
  async listCaches(req: AuthReq) {
    const pattern = req.query.pattern as string;
    return this.cacheStore.keys(pattern ?? '*');
  }

  @Get('/_cache/:key')
  @Auth('cache:view')
  async viewCache(req: AuthReq) {
    const cacheKey = req.params.key as string;
    return this.cacheStore.get(cacheKey);
  }

  @Delete('/_cache/:key')
  @Auth('cache:delete')
  async deleteCache(req: AuthReq) {
    const cacheKey = req.params.key as string;
    return this.cacheStore.delete(cacheKey);
  }

  @Delete('/_cache')
  @Auth('cache:delete')
  async deleteCaches(req: AuthReq) {
    const pattern = req.query.pattern as string;
    const cacheStore = this.cacheStore;
    const cacheKeys = await cacheStore.keys(pattern ?? '*');
    return Promise.all(
      cacheKeys.map(async (key) => {
        await cacheStore.delete(key);
        return key;
      })
    );
  }

  @Post('/_event/:channel')
  @Auth('event:create')
  emit(req: AuthReq) {
    const channel = req.params.channel as string;
    return this.publisher.publish(req.body, channel);
  }

  @Delete()
  @Auth('app:delete')
  async stop(req: AuthReq) {
    const { client, builder } = useSlack();
    await client.send(builder.stopped(req._auth.email));
    shutdown();
  }
}

/**
 * Exposes endpoints for testing in development environment.
 */
@Controller()
export class DevController {
  @Get('/_metadata')
  @When(isDev)
  async metadata() {
    const appInfo = useAppInfo();
    return {
      env: appInfo.env,
      name: appInfo.appName,
      version: appInfo.appVersion,
      description: appInfo.appDescription,
      now: new Date().toISOString(),
    };
  }

  @Request('/_echo')
  @When(isDev)
  echo(req: Req) {
    return req;
  }

  @Get('/_ip', {
    produces: 'text/plain',
  })
  @When(isDev)
  clientIP(req: Req) {
    return clientIP(req);
  }

  @Get('/_auth')
  @Auth()
  @When(isDev)
  auth(req: AuthReq) {
    return req._auth;
  }

  @Get('/_test/rate-limit')
  @RateLimit()
  @When(isDev)
  testRateLimit() {
    return true;
  }
}
