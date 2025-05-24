import { Application, Module } from 'untangled-web/core/http';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
})
export class App extends Application {}
