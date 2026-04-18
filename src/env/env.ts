export class Env {
  public loadDotEnv() {
    // No-op. Automatic .env loading was removed in favor of explicit process.env
    // configuration and LoggerAdaptToConsole({ envOptions }).
  }
}
