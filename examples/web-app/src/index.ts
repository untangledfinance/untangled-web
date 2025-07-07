import { shutdown } from 'untangled-web/core/ioc';
import { App } from './app.module';

async function start() {
  await $(App).start({
    port: Configs.app.port,
  });
}

async function stop() {
  shutdown();
}

start().then(() => process.on('SIGTERM', stop).on('SIGINT', stop));
