import { Boot } from 'untangled-web/boot';
import * as bootLoaders from 'untangled-web/boot/loaders';
import { Application, Module } from 'untangled-web/core/http';
import type { Runner } from 'untangled-web/core/scheduling';
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
    jwt: true,
  })
)
@Module({
  controllers: [AppController],
})
export class App extends Application {
  async onInit() {
    const jobs: Class<Runner>[] = [AppJob];
    jobs.forEach((job) => $(job)); // enable jobs
  }

  async onStop() {
    await this.stop();
  }
}
