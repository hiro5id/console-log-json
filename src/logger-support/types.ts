/* tslint:disable:object-literal-sort-keys */
import { RedactOptions } from '../redact';

export enum LOG_LEVEL {
  /**
   * Priority 0
   */
  error = 'error',
  /**
   * Priority 1
   */
  warn = 'warn',
  /**
   * Priority 2
   */
  info = 'info',
  /**
   * Priority 3
   */
  http = 'http',
  /**
   * Priority 4
   */
  verbose = 'verbose',
  /**
   * Priority 5
   */
  debug = 'debug',
  /**
   * Priority 6
   */
  silly = 'silly',
}

export const LOG_LEVEL_PRIORITY: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

export const LOGGER_ENV_VARS = {
  colorize: 'CONSOLE_LOG_COLORIZE',
  noNewLineCharacters: 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS',
  noNewLineCharactersExceptStack: 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK',
  noTimeStamp: 'CONSOLE_LOG_JSON_NO_TIME_STAMP',
  disableAutoParse: 'CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE',
  noStackForNonError: 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR',
  noFileName: 'CONSOLE_LOG_JSON_NO_FILE_NAME',
  noPackageName: 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME',
  noLoggerDebug: 'CONSOLE_LOG_JSON_NO_LOGGER_DEBUG',
  contextKey: 'CONSOLE_LOG_JSON_CONTEXT_KEY',
  logLevel: 'CONSOLE_LOG_JSON_LOG_LEVEL',
  debugString: 'CONSOLE_LOG_JSON_DEBUG_STRING',
  customOptions: 'CONSOLE_LOG_JSON_CUSTOM_OPTIONS',
  onLog: 'CONSOLE_LOG_JSON_ON_LOG',
  onLogTimeout: 'CONSOLE_LOG_JSON_ON_LOG_TIMEOUT',
  transformOutput: 'CONSOLE_LOG_JSON_TRANSFORM_OUTPUT',
  redact: 'CONSOLE_LOG_JSON_REDACT',
};

export interface LoggerEnvironmentConfig {
  noNewLineCharacters: boolean;
  noNewLineCharactersExceptStack: boolean;
  noTimeStamp: boolean;
  disableAutoParse: boolean;
  colorize: boolean;
  noStackForNonError: boolean;
  noFileName: boolean;
  noPackageName: boolean;
  noLoggerDebug: boolean;
  contextKey: string;
}

export interface LoggerAdaptToConsoleOptions {
  logLevel?: LOG_LEVEL | string;
  debugString?: boolean;
  customOptions?: { [key: string]: any };
  colorize?: boolean;
  noNewLineCharacters?: boolean;
  noNewLineCharactersExceptStack?: boolean;
  noTimeStamp?: boolean;
  disableAutoParse?: boolean;
  noStackForNonError?: boolean;
  noFileName?: boolean;
  noPackageName?: boolean;
  noLoggerDebug?: boolean;
  contextKey?: string;
  envOptions?: Record<string, any>;
  onLog?: ((jsonString: string, parsedObject: any) => void) | string;
  onLogTimeout?: number;
  transformOutput?: ((parsedObject: any) => any) | string;
  redact?: RedactOptions | string;
}

export interface ResolvedLoggerAdaptToConsoleOptions {
  logLevel: LOG_LEVEL;
  debugString: boolean;
  customOptions: { [key: string]: any } | null;
  onLog: ((jsonString: string, parsedObject: any) => void) | null;
  onLogTimeout: number;
  transformOutput: ((parsedObject: any) => any) | null;
  redact: RedactOptions | undefined;
}
