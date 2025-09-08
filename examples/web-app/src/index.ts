import { boot } from 'untangled-web/boot';
import { App } from './app.module';

async function main() {
  const app = await boot(App);
  return app.start({
    port: Configs.app.port,
  });
}

main();
