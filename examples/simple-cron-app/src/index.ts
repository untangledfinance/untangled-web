import { AppJob } from './app.job';

async function start() {
  new AppJob(); // initialize the instance to start scheduling
}

start();
