export class AppService {
  async getCurrentTime() {
    return new Date().toISOString();
  }
}
