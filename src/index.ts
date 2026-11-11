// Public API — only export what consumers should depend on

export { ErrorWithContext } from './error-with-context';
export {
  GetLogLevel,
  SetLogLevel,
  LOG_LEVEL,
  LoggerAdaptToConsoleOptions,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  NativeConsoleLog,
  OnLogCallback,
  OnLogContext,
} from './logger';
