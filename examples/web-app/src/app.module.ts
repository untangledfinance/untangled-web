import { Boot } from 'untangled-web/boot';
import * as bootLoaders from 'untangled-web/boot/loaders';
import { Application, Module } from 'untangled-web/core/http';
import { AppController } from './app.controller';

@Auto
@Boot(
  bootLoaders.config(),
  bootLoaders.bean({
    database: true,
    jwt: true,
  })
)
@Module({
  controllers: [AppController],
})
export class App extends Application {
  async onStop() {
    await this.stop();
  }
}
