import { App } from './app.module';

function start() {
  new App().start({
    port: 8080,
  }); // the server starts listening at http://0.0.0.0:8080
}

start();
