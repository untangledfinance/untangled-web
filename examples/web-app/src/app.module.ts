import { Boot, Bootable } from 'untangled-web/boot';
import * as bootLoaders from 'untangled-web/boot/loaders';
import { HealthController } from 'untangled-web/boot/_dev';
import { Application, Module } from 'untangled-web/core/http';
import { AppController } from './app.controller';
import { AppJob } from './app.job';

@Auto
@Boot(
  bootLoaders.config(),
  bootLoaders.bean({
    cache: true,
    database: {
      mongo: true,
    },
    queue: {
      redis: true,
    },
    lock: {
      redis: true,
    },
    jwt: true,
    scheduler: {
      enabled: true,
      jobs: [AppJob],
    },
    safeExit: true,
  })
)
@Module({
  controllers: [HealthController, AppController],
})
export class App extends Application implements Bootable {
  async main() {
    await this.start({
      host: Configs.app.host,
      port: Configs.app.port,
    });
  }
}
