import { App } from './app.module';

async function main() {
  return $(App).start({
    port: Configs.app.port,
  });
}

main();
