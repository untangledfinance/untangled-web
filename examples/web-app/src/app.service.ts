import { Lock } from './app.util';

export class AppService {
  async getCurrentTime() {
    return new Date().toISOString();
  }

  @Lock(10000)
  async getProtectedResource() {
    console.log('Accessing protected resource...');
    await Bun.sleep(5000);
    console.log('Protected resource accessed.');
    return new Date().toISOString();
  }
}
