/* tslint:disable:object-literal-sort-keys */
import { getEnv } from './get-env';
import { ErrorWithContext } from './error-with-context';
import { FormatStackTrace } from './format-stack-trace';
import { getCallStackFromString } from './get-call-stack';
import { getCallingFilename, registerInternalCallerFunction } from './get-calling-filename';
import { getPackageNameAsync, getPackageNameSync } from './package-name';
import { compileRedactor, RedactOptions, Redactor } from './redact';
import { safeObjectAssign } from './safe-object-assign';
import { sortObject } from './sort-object';
import { ToOneLine } from './to-one-line';
import { NewLineCharacter, resetNewLineCharacterCache } from './new-line-character';
import { colorJson } from './colors/colorize';
import { jsonStringifySafe } from './json-stringify-safe/stringify-safe';

// tslint:disable-next-line:no-var-requires
try {
  if (typeof require !== 'undefined') {
    require('source-map-support').install({ hookRequire: true }); // tslint:disable-line:no-var-requires
  }
} catch (_) {
  /* source-map-support not available */
}

// tslint:disable-next-line:no-var-requires
/* tslint:disable:no-conditional-assignment */

// Console-polyfill. MIT license.
// https://github.com/paulmillr/console-polyfill
// Make it safe to do console.log() always.
((global: any) => {
  'use strict';
  if (global == null) {
    return;
  }
  if (!global.console) {
    // @ts-ignore
    global.console = {} as any;
  }
  const con = global.console;
  let prop;
  let method;
  // tslint:disable-next-line:no-empty only-arrow-functions
  const dummy = function () {};
  const properties = ['memory'];
  const methods = (
    'assert,clear,count,debug,dir,dirxml,error,exception,group,' +
    'groupCollapsed,groupEnd,info,log,markTimeline,profile,profiles,profileEnd,' +
    'show,table,time,timeEnd,timeline,timelineEnd,timeStamp,trace,warn,timeLog,trace'
  ).split(',');
  while ((prop = properties.pop())) {
    if (!(con as any)[prop]) {
      (con as any)[prop] = {};
    }
  }
  while ((method = methods.pop())) {
    if (!(con as any)[method]) {
      (con as any)[method] = dummy;
    }
  }
  // Using `globalThis` for universal support (Node, browsers, web workers).
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {});

declare global {
  // tslint:disable-next-line:interface-name
  interface Console {
    // Console: NodeJS.ConsoleConstructor;

    /**
     * Priority 0
     */
    error(...args: any[]): void;

    /**
     * Priority 1
     */
    warn(...args: any[]): void;

    /**
     * Priority 2
     */
    info(...args: any[]): void;

    /**
     * Priority 3
     */
    http(...args: any[]): void;

    /**
     * Priority 4
     */
    verbose(...args: any[]): void;

    /**
     * Priority 5
     */
    debug(...args: any[]): void;

    /**
     * Priority 6 (critical)
     */
    silly(...args: any[]): void;

    /**
     * Priority 2 (same as console.info)
     */
    log(...args: any[]): void;
  }
}

function buildFormattedLogObject(object: any) {
  let returnData: any = object;

  // Preserve object-valued message under a dedicated field instead of flattening it.
  if (typeof object.message === 'object') {
    const messageObj = object.message;
    delete returnData.message;
    const clonedMessageObject = safeObjectAssign({}, [], messageObj);
    if (returnData['@messageObject'] == null) {
      returnData['@messageObject'] = clonedMessageObject;
    } else {
      returnData['@messageObject'] = safeObjectAssign(returnData['@messageObject'], [], clonedMessageObject);
    }
  }

  // Combine extra context from ErrorWithContext
  if (object.extraContext) {
    const extraContext = object.extraContext;
    delete returnData.extraContext;
    returnData = safeObjectAssign(returnData, ['message'], extraContext);
  }

  // Add stack trace if available
  if (object.stack) {
    const stack = object.stack;
    const stackOneLine = FormatStackTrace.toNewLines(ToOneLine(stack));
    delete returnData.stack;
    delete returnData.errCallStack;
    returnData = safeObjectAssign(returnData, ['message'], { errCallStack: stackOneLine });
    returnData.level = 'error';

    // Lets put a space into the message when stack message exists
    if (returnData.message) {
      if (!stackMessageRegex) {
        stackMessageRegex = new RegExp(`^Error:[ ](.*?)${NewLineCharacter()}`, 'im');
      }
      const stackRegexMatch = stackOneLine.match(stackMessageRegex);
      if (stackRegexMatch != null && stackRegexMatch.length >= 2) {
        const stackMessage = stackRegexMatch[1];
        returnData.message = `${ToOneLine(returnData.message).replace(stackMessage, '')} - ${stackMessage}`;
      }
      returnData.message = ToOneLine(returnData.message);
    }
    // info.stack
  }

  // Ensure that message is second in the resulting JSON
  if (returnData.message) {
    const message = returnData.message;
    delete returnData.message;
    returnData = { message, ...returnData };
  }

  // Ensure that log level is first in the resulting JSON
  if (returnData.level) {
    const savedLogLevel = returnData.level;
    delete returnData.level;
    returnData = { level: savedLogLevel, ...returnData };
  }

  // Add timestamp
  if (!envConfig.noTimeStamp) {
    returnData['@timestamp'] = new Date().toISOString();
  }

  // cleanup leading dash in message
  if (typeof returnData.message === 'string' && returnData.message.startsWith(' - ')) {
    returnData.message = returnData.message.substring(3);
  }

  // interpret JSON if it is inside the error message
  if (typeof returnData.message === 'string' && returnData.message.length > 0) {
    let parsedObject = null;
    // Quick check: only attempt JSON.parse if the message looks like it could be JSON
    const trimmedMsg = returnData.message.trim();
    const firstChar = trimmedMsg.charAt(0);
    if (
      firstChar === '{' ||
      firstChar === '[' ||
      firstChar === '"' ||
      firstChar === '-' ||
      (firstChar >= '0' && firstChar <= '9') ||
      trimmedMsg === 'true' ||
      trimmedMsg === 'false' ||
      trimmedMsg === 'null'
    ) {
      try {
        // if defined CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE=TRUE, disable auto parsing.
        if (envConfig.disableAutoParse) {
          parsedObject = JSON.parse(returnData.message); // trim & remove new lines
          parsedObject = JSON.stringify(parsedObject);
        } else {
          parsedObject = JSON.parse(returnData.message);
        }
      } catch (err) {
        // do nothing
      }
    }
    if (parsedObject != null) {
      if (envConfig.disableAutoParse) {
        returnData.message = parsedObject;
      } else {
        returnData.message = '<auto-parsed-json-string-see-@autoParsedJson-property>';
        returnData['@autoParsedJson'] = parsedObject;
      }
    }
  }

  if (returnData.message != null && typeof returnData.message === 'string' && returnData.message.length === 0) {
    if (returnData.level === 'error') {
      returnData.message = '<no-error-message-was-passed-to-console-log>';
    } else {
      returnData.message = '<no-message-was-passed-to-console-log>';
    }
  }

  if (returnData.message == null && returnData['@messageObject'] != null) {
    if (returnData.level === 'error') {
      returnData.message = '<no-error-message-was-passed-to-console-log>';
    } else {
      returnData.message = '<no-message-was-passed-to-console-log>';
    }
  }

  return returnData;
}

function appendTrailingLogCharacter(text: string): string {
  let endOfLogCharacter = '\n';
  if (envConfig.noNewLineCharacters || envConfig.noNewLineCharactersExceptStack) {
    endOfLogCharacter = '';
  }
  return `${text}${endOfLogCharacter}`;
}

function formatLogObjectForOutput(logObject: any, jsonString?: string): string {
  if (envConfig.colorize) {
    return appendTrailingLogCharacter(colorJson(logObject));
  }
  return appendTrailingLogCharacter(jsonString != null ? jsonString : jsonStringifySafe(logObject));
}

function hasDomLikeDocument(): boolean {
  const globalObject: any = typeof globalThis !== 'undefined' ? globalThis : {};
  const maybeWindow = globalObject.window;
  const maybeDocument = globalObject.document || (maybeWindow != null ? maybeWindow.document : undefined);
  if (maybeDocument == null) {
    return false;
  }

  try {
    return typeof maybeDocument.createElement === 'function';
  } catch (_) {
    return true;
  }
}

function shouldUseProcessStdoutWrite(): boolean {
  if (typeof process === 'undefined' || process.stdout == null || typeof process.stdout.write !== 'function') {
    return false;
  }

  // Browser-oriented hosts sometimes expose a compatibility process.stdout.write
  // that loops back into patched console methods. Keep direct stdout writes for
  // real Node, but prefer the saved native console path when a DOM is present.
  if (hasDomLikeDocument()) {
    return false;
  }

  return true;
}

function cloneForMutation(value: any, seen: Map<any, any> = new Map<any, any>()): any {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const clonedArray: any[] = [];
    seen.set(value, clonedArray);
    for (const item of value) {
      clonedArray.push(cloneForMutation(item, seen));
    }
    return clonedArray;
  }

  const clonedObject: any = {};
  seen.set(value, clonedObject);
  for (const key of Object.keys(value)) {
    clonedObject[key] = cloneForMutation(value[key], seen);
  }
  return clonedObject;
}

export function FormatErrorObject(object: any) {
  return formatLogObjectForOutput(buildFormattedLogObject(object));
}

const LOG_LEVEL_PRIORITY: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

function writeOutput(text: string): void {
  runWithInternalWriteGuard(() => {
    if (shouldUseProcessStdoutWrite()) {
      process.stdout.write(text + '\n');
    } else if (consoleLogBackup) {
      invokeCapturedConsoleMethod(consoleLogBackup, text);
    }
  });
}

const Logger = {
  _level: 'info',
  get level(): string {
    return this._level;
  },
  set level(l: string) {
    this._level = l;
  },
  log(level: string, message: string, errorObject?: any): void {
    const msgPriority = LOG_LEVEL_PRIORITY[level] ?? 2;
    const configPriority = LOG_LEVEL_PRIORITY[this._level] ?? 2;
    if (msgPriority > configPriority) {
      return;
    }

    const info: any = { level, message };

    if (errorObject != null) {
      // Copy enumerable properties
      Object.assign(info, errorObject);
      // Restore level — meta properties must not override the log level
      info.level = level;

      // Copy non-enumerable Error properties (stack, message, name)
      if (errorObject instanceof Error) {
        for (const key of Object.getOwnPropertyNames(errorObject)) {
          if (key === 'message') {
            // Replicate Winston behavior: concatenate error.message onto info.message
            if (errorObject.message && errorObject.message !== message) {
              info.message = message.length > 0 ? `${message} ${errorObject.message}` : errorObject.message;
            }
          } else if (!(key in info)) {
            info[key] = (errorObject as any)[key];
          }
        }
        // Ensure stack is always on info (replicates w.format.errors({ stack: true }))
        if (errorObject.stack) {
          info.stack = errorObject.stack;
        }
      }
    }

    let outputObject = buildFormattedLogObject(info);

    // Apply user's transform if provided — falls back to original on error
    if (transformOutputCallback) {
      try {
        const transformed = transformOutputCallback(outputObject);
        if (transformed != null && typeof transformed === 'object') {
          outputObject = transformed;
        }
      } catch (_) {
        /* transform error — use original formatted output */
      }
    }

    if (redactor) {
      try {
        outputObject = cloneForMutation(outputObject);
        redactor.redact(outputObject);
      } catch (_) {
        /* redaction error — use unredacted output rather than breaking the app */
      }
    }

    const callbackJsonString = onLogCallback || !envConfig.colorize ? jsonStringifySafe(outputObject) : null;
    const formatted = formatLogObjectForOutput(outputObject, callbackJsonString == null ? undefined : callbackJsonString);

    writeOutput(formatted);

    // Call user's log interceptor safely and asynchronously
    if (onLogCallback) {
      const callback = onLogCallback;
      const timeout = onLogTimeoutMs;
      try {
        const jsonString = callbackJsonString == null ? jsonStringifySafe(outputObject) : callbackJsonString;
        const parsedCopy = JSON.parse(jsonString);
        // Run async so it doesn't block the caller
        const timeoutId = setTimeout(() => {
          /* interceptor timed out — silently ignore */
        }, timeout);
        Promise.resolve()
          .then(() => callback(jsonString, parsedCopy))
          .then(() => clearTimeout(timeoutId))
          .catch(() => clearTimeout(timeoutId));
      } catch (_) {
        /* interceptor error — silently ignore */
      }
    }
  },
};

export function GetLogLevel() {
  return Logger.level;
}

export function SetLogLevel(level: string) {
  Logger.level = level;
}

let consoleErrorBackup: any = null;
let consoleWarningBackup: any = null;
let consoleInfoBackup: any = null;
let consoleHttpBackup: any = null;
let consoleVerboseBackup: any = null;
let consoleDebugBackup: any = null;
let consoleSillyBackup: any = null;
let consoleLogBackup: any = null;
let internalWriteDepth = 0;

function invokeCapturedConsoleMethod(method: any, ...args: any[]): void {
  if (typeof method !== 'function') {
    return;
  }

  try {
    Function.prototype.apply.call(method, console, args);
  } catch (_) {
    method(...args);
  }
}

function runWithInternalWriteGuard(callback: () => void): void {
  internalWriteDepth += 1;
  try {
    callback();
  } finally {
    internalWriteDepth -= 1;
  }
}

function isHandlingInternalWriteFeedback(): boolean {
  return internalWriteDepth > 0;
}

export function NativeConsoleLog(...args: any[]) {
  if (consoleLogBackup) {
    runWithInternalWriteGuard(() => {
      invokeCapturedConsoleMethod(consoleLogBackup, ...args);
    });
  } else {
    console.log(...args);
  }
}

function ifEverythingFailsLogger(functionName: string, err: Error) {
  try {
    if (consoleErrorBackup != null) {
      runWithInternalWriteGuard(() => {
        invokeCapturedConsoleMethod(consoleErrorBackup, `{"level":"error","message":"Error: console-log-json: error while trying to process ${functionName} : ${err.message}"}`);
      });
    }
  } catch (err) {
    // fail silently, we don't want to throw from here since this is the last resort logger when everything else has failed
  }
}

let logParams!: { logLevel: LOG_LEVEL; debugString: boolean };

// Pre-compiled regex for stack message extraction — compiled once at init time
let stackMessageRegex: RegExp;

const LOGGER_ENV_VARS = {
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

// Cached environment configuration — populated once at LoggerAdaptToConsole() time
let envConfig = {
  noNewLineCharacters: false,
  noNewLineCharactersExceptStack: false,
  noTimeStamp: false,
  disableAutoParse: false,
  colorize: false,
  noStackForNonError: false,
  noFileName: false,
  noPackageName: false,
  noLoggerDebug: false,
  contextKey: '' as string,
};

/** Programmatic overrides passed via LoggerAdaptToConsole({ envOptions }) */
let envOptionOverrides: Record<string, any> = {};

/** User-provided log interceptor callback */
let onLogCallback: ((jsonString: string, parsedObject: any) => void) | null = null;
let onLogTimeoutMs: number = 5000;

/** User-provided synchronous transform — runs before output, can modify the log object */
let transformOutputCallback: ((parsedObject: any) => any) | null = null;
let redactor: Redactor | null = null;

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

function getConfiguredEnvValue(envVarName: string): any {
  if (envVarName in envOptionOverrides) {
    return envOptionOverrides[envVarName];
  }
  return getEnv(envVarName);
}

function isTrue(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

function parseJsonConfigValue(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(trimmedValue);
  } catch (_) {
    return undefined;
  }
}

function normalizeLogLevelValue(value: any, defaultLevel: LOG_LEVEL = LOG_LEVEL.info): LOG_LEVEL {
  if (typeof value !== 'string') {
    return defaultLevel;
  }

  let normalizedLevel = value.trim().toLowerCase();
  if (normalizedLevel.length === 0) {
    return defaultLevel;
  }

  if (normalizedLevel === 'err') {
    normalizedLevel = LOG_LEVEL.error;
  } else if (normalizedLevel === 'warning') {
    normalizedLevel = LOG_LEVEL.warn;
  } else if (normalizedLevel === 'information') {
    normalizedLevel = LOG_LEVEL.info;
  }

  return Object.prototype.hasOwnProperty.call(LOG_LEVEL_PRIORITY, normalizedLevel) ? (normalizedLevel as LOG_LEVEL) : defaultLevel;
}

function normalizeTimeoutValue(value: any, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return defaultValue;
}

function normalizeCustomOptionsValue(value: any): { [key: string]: any } | null {
  const parsedValue = parseJsonConfigValue(value);
  if (parsedValue != null && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
    return parsedValue as { [key: string]: any };
  }
  return null;
}

function normalizeRedactValue(value: any): RedactOptions | undefined {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value as RedactOptions;
  }

  if (typeof value === 'object') {
    return value as RedactOptions;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return undefined;
  }

  const parsedValue = parseJsonConfigValue(trimmedValue);
  if (Array.isArray(parsedValue) || (parsedValue != null && typeof parsedValue === 'object')) {
    return parsedValue as RedactOptions;
  }

  const splitValue = trimmedValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return splitValue.length > 0 ? splitValue : undefined;
}

function resolveGlobalPath(path: string): any {
  const rootObject: any = typeof globalThis !== 'undefined' ? globalThis : {};
  const parts = path
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return undefined;
  }

  let current = rootObject;
  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

type AnyFunction = (...args: any[]) => any;

function normalizeFunctionValue<T extends AnyFunction>(value: any): T | null {
  if (typeof value === 'function') {
    return value as T;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const resolved = resolveGlobalPath(trimmedValue);
  return typeof resolved === 'function' ? (resolved as T) : null;
}

function applyIfDefined(target: Record<string, any>, envVarName: string, value: any): void {
  if (value !== undefined) {
    target[envVarName] = value;
  }
}

function buildEnvOptionOverrides(options?: LoggerAdaptToConsoleOptions): Record<string, any> {
  const overrides: Record<string, any> = { ...(options?.envOptions || {}) };

  applyIfDefined(overrides, LOGGER_ENV_VARS.colorize, options?.colorize);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noNewLineCharacters, options?.noNewLineCharacters);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noNewLineCharactersExceptStack, options?.noNewLineCharactersExceptStack);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noTimeStamp, options?.noTimeStamp);
  applyIfDefined(overrides, LOGGER_ENV_VARS.disableAutoParse, options?.disableAutoParse);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noStackForNonError, options?.noStackForNonError);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noFileName, options?.noFileName);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noPackageName, options?.noPackageName);
  applyIfDefined(overrides, LOGGER_ENV_VARS.noLoggerDebug, options?.noLoggerDebug);
  applyIfDefined(overrides, LOGGER_ENV_VARS.contextKey, options?.contextKey);

  return overrides;
}

function resolveOptionValue(directValue: any, envVarName: string): any {
  if (directValue !== undefined) {
    return directValue;
  }
  return getConfiguredEnvValue(envVarName);
}

function resolveLoggerAdaptToConsoleOptions(options?: LoggerAdaptToConsoleOptions): {
  logLevel: LOG_LEVEL;
  debugString: boolean;
  customOptions: { [key: string]: any } | null;
  onLog: ((jsonString: string, parsedObject: any) => void) | null;
  onLogTimeout: number;
  transformOutput: ((parsedObject: any) => any) | null;
  redact: RedactOptions | undefined;
} {
  return {
    logLevel: normalizeLogLevelValue(resolveOptionValue(options?.logLevel, LOGGER_ENV_VARS.logLevel), LOG_LEVEL.info),
    debugString: isTrue(resolveOptionValue(options?.debugString, LOGGER_ENV_VARS.debugString)),
    customOptions: normalizeCustomOptionsValue(resolveOptionValue(options?.customOptions, LOGGER_ENV_VARS.customOptions)),
    onLog: normalizeFunctionValue<(jsonString: string, parsedObject: any) => void>(resolveOptionValue(options?.onLog, LOGGER_ENV_VARS.onLog)),
    onLogTimeout: normalizeTimeoutValue(resolveOptionValue(options?.onLogTimeout, LOGGER_ENV_VARS.onLogTimeout), 5000),
    transformOutput: normalizeFunctionValue<(parsedObject: any) => any>(resolveOptionValue(options?.transformOutput, LOGGER_ENV_VARS.transformOutput)),
    redact: normalizeRedactValue(resolveOptionValue(options?.redact, LOGGER_ENV_VARS.redact)),
  };
}

export function loadEnvConfig() {
  envConfig = {
    noNewLineCharacters: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noNewLineCharacters)),
    noNewLineCharactersExceptStack: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noNewLineCharactersExceptStack)),
    noTimeStamp: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noTimeStamp)),
    disableAutoParse: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.disableAutoParse)),
    colorize: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.colorize)),
    noStackForNonError: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noStackForNonError)),
    noFileName: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noFileName)),
    noPackageName: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noPackageName)),
    noLoggerDebug: isTrue(getConfiguredEnvValue(LOGGER_ENV_VARS.noLoggerDebug)),
    contextKey: getConfiguredEnvValue(LOGGER_ENV_VARS.contextKey) || '',
  };
  resetNewLineCharacterCache();
  stackMessageRegex = new RegExp(`^Error:[ ](.*?)${NewLineCharacter()}`, 'im');
}

/**
 * This function adapts a logger to the console.
 *
 * @param {LoggerAdaptToConsoleOptions} [options] - An optional parameter that can configure log level, formatting flags, debug output, extra context, structured redaction, and lifecycle hooks.
 *
 * @example
 * // Default behavior with no options
 * LoggerAdaptToConsole();
 *
 * @example
 * // Pass an object with logLevel and debugString
 * LoggerAdaptToConsole({ logLevel: LOG_LEVEL.INFO, debugString: true });
 *
 * @example
 * // Override default options and add customOptions
 * LoggerAdaptToConsole({ logLevel: LOG_LEVEL.ERROR, debugString: false, customOptions: { applicationName: 'my-app' } });
 *
 * @example
 * // Redact sensitive fields from the final structured log object
 * LoggerAdaptToConsole({ redact: ['password', 'headers.authorization'] });
 */
export function LoggerAdaptToConsole(options?: LoggerAdaptToConsoleOptions) {
  envOptionOverrides = buildEnvOptionOverrides(options);
  const resolvedOptions = resolveLoggerAdaptToConsoleOptions(options);
  onLogCallback = resolvedOptions.onLog;
  onLogTimeoutMs = resolvedOptions.onLogTimeout;
  transformOutputCallback = resolvedOptions.transformOutput;
  redactor = compileRedactor(resolvedOptions.redact);
  loadEnvConfig();

  logParams = {
    logLevel: resolvedOptions.logLevel,
    debugString: resolvedOptions.debugString,
  };
  customOptionsReference = resolvedOptions.customOptions;
  customOptionKeys = customOptionsReference ? Object.keys(customOptionsReference) : [];

  // log package name
  packageName = '';
  packageNameState = 'uninitialized';
  startPackageNameInitialization();

  Logger.level = resolvedOptions.logLevel;

  if (consoleErrorBackup == null) {
    consoleErrorBackup = console.error;
  }
  if (consoleWarningBackup == null) {
    consoleWarningBackup = console.warn;
  }
  if (consoleInfoBackup == null) {
    consoleInfoBackup = console.info;
  }

  if (consoleHttpBackup == null) {
    consoleHttpBackup = console.http;
  }

  if (consoleVerboseBackup == null) {
    consoleVerboseBackup = console.verbose;
  }

  if (consoleDebugBackup == null) {
    consoleDebugBackup = console.debug;
  }

  if (consoleSillyBackup == null) {
    consoleSillyBackup = console.silly;
  }

  if (consoleLogBackup == null) {
    consoleLogBackup = console.log;
  }

  console.error = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.error, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.error as any);

  console.warn = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.warn, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.warn as any);

  console.info = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.info, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.info as any);

  console.http = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.http, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.http as any);

  console.verbose = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.verbose, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.verbose as any);

  console.debug = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.debug, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.debug as any);

  console.silly = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.silly, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.silly as any);

  console.log = (...args: any[]) => {
    return logUsingConsoleJson(args, LOG_LEVEL.info, resolvedOptions.customOptions || undefined);
  };
  registerInternalCallerFunction(console.log as any);
}

function filterNullOrUndefinedParameters(args: any[]): number {
  let nullOrUndefinedCount = 0;
  for (let index = args.length - 1; index >= 0; index--) {
    if (args[index] == null) {
      nullOrUndefinedCount += 1;
      args.splice(index, 1);
    }
  }
  return nullOrUndefinedCount;
}

function findExplicitLogLevelAndUseIt(args: any[], level: LOG_LEVEL) {
  let foundLevel = false;
  args.forEach((f: any) => {
    if (!foundLevel && f && typeof f === 'object' && Object.keys(f) && Object.keys(f).length > 0 && Object.keys(f)[0].toLowerCase() === 'level') {
      level = normalizeLogLevelValue(f[Object.keys(f)[0]], LOG_LEVEL.info);

      // Remove this property since we have absorbed it into the log level
      delete f[Object.keys(f)[0]];
      foundLevel = true;
    }
  });
  return level;
}

let packageName: string = '';
let customOptionsReference: { [key: string]: any } | null = null;
let customOptionKeys: string[] = [];
type PackageNameState = 'uninitialized' | 'pending' | 'ready' | 'unavailable';
type PendingLogEntry = { args: any[]; level: LOG_LEVEL; customOptions?: object; fileInfo?: any | null };
let packageNameState: PackageNameState = 'uninitialized';
let packageNameInitVersion = 0;
let pendingLogs: PendingLogEntry[] = [];

function startPackageNameInitialization(): void {
  packageName = getPackageNameSync();
  if (packageName.length > 0) {
    packageNameState = 'ready';
    flushPendingLogs();
    return;
  }

  if (envConfig.noPackageName || typeof process === 'undefined' || typeof process.cwd !== 'function') {
    packageNameState = 'unavailable';
    flushPendingLogs();
    return;
  }

  packageNameState = 'pending';
  const initVersion = ++packageNameInitVersion;
  getPackageNameAsync()
    .then((resolvedPackageName) => {
      if (initVersion !== packageNameInitVersion) {
        return;
      }
      packageName = resolvedPackageName;
      packageNameState = packageName.length > 0 ? 'ready' : 'unavailable';
    })
    .catch(() => {
      if (initVersion !== packageNameInitVersion) {
        return;
      }
      packageName = '';
      packageNameState = 'unavailable';
    })
    .then(() => {
      if (initVersion !== packageNameInitVersion) {
        return;
      }
      flushPendingLogs();
    });
}

function flushPendingLogs(): void {
  if (pendingLogs.length === 0) {
    return;
  }

  const logsToFlush = pendingLogs;
  pendingLogs = [];

  for (const pendingLog of logsToFlush) {
    emitConsoleJsonLog(pendingLog.args, pendingLog.level, pendingLog.customOptions, pendingLog.fileInfo);
  }
}

function maybeAddPackageName(args: any[]): void {
  if (envConfig.noPackageName) {
    return;
  }

  if (packageNameState === 'ready' && packageName.length > 0) {
    args.push({ '@packageName': packageName });
  }
}

function captureFileInfo(): any | null {
  // Skip entirely when both features are suppressed — avoids the expensive new Error() call
  if (envConfig.noFileName && envConfig.noStackForNonError) {
    return null;
  }

  try {
    const sharedStack = new Error().stack ?? '';
    const name = !envConfig.noFileName ? getCallingFilename(sharedStack) : null;
    const callStack = !envConfig.noStackForNonError ? getCallStackFromString(sharedStack) : undefined;
    const fileInfo: any = {};
    if (!envConfig.noFileName) {
      fileInfo['@filename'] = name || '<unknown>';
    }
    if (!envConfig.noStackForNonError) {
      fileInfo['@logCallStack'] = callStack;
    }
    return fileInfo;
  } catch (err: any) {
    return { '@filename': `<error>:${err.message}`, '@logCallStack': err.message };
  }
}

function emitConsoleJsonLog(args: any[], level: LOG_LEVEL, customOptions?: object, fileInfo?: any | null) {
  maybeAddPackageName(args);

  // log debug logging if needed
  try {
    if (logParams.debugString) {
      // this line is only for enabling testing
      if ((console as any).debugStringException != null) {
        (console as any).debugStringException();
      }

      let argsStringArray = args.map((m) => JSON.stringify(m, Object.getOwnPropertyNames(m)));
      if (!argsStringArray) {
        argsStringArray = [];
      }
      args.push({ _loggerDebug: argsStringArray });
    }
  } catch (err: any) {
    args.push({ _loggerDebug: `err ${err.message}` });
  }

  const effectiveFileInfo = fileInfo !== undefined ? fileInfo : captureFileInfo();
  if (effectiveFileInfo != null) {
    args.push(effectiveFileInfo);
  }

  // Custom options
  try {
    const runtimeCustomOptions = customOptionsReference || (customOptions ? (customOptions as { [key: string]: any }) : null);
    const runtimeCustomOptionKeys = customOptionsReference ? customOptionKeys : runtimeCustomOptions ? Object.keys(runtimeCustomOptions) : [];
    if (runtimeCustomOptions) {
      for (const key of runtimeCustomOptionKeys) {
        if (Object.prototype.hasOwnProperty.call(runtimeCustomOptions, key)) {
          const obj: { [key: string]: any } = {};
          obj[key] = runtimeCustomOptions[key];
          args.push(obj);
        }
      }
    }
  } catch (err: any) {
    args.push({ _customOptionsError: `err ${err.message}` });
  }

  try {
    level = findExplicitLogLevelAndUseIt(args, level);

    // this line is only for enabling testing
    if ((console as any).exception != null) {
      (console as any).exception();
    }
    const { message, errorObject } = extractParametersFromArguments(args);

    Logger.log(level, message, supressDetailsIfSelected(errorObject));
  } catch (err: any) {
    ifEverythingFailsLogger('console.log', err);
  }
}

/**
 * It takes the arguments passed to the console methods and formats them as console-log-json output
 * @param {any[]} args - any[] - the arguments passed to the console.log function
 * @param {LOG_LEVEL} level - LOG_LEVEL
 * @param {object} [customOptions] - object - an optional parameter that can be an object with custom settings for the logger
 */
export function logUsingConsoleJson(args: any[], level: LOG_LEVEL, customOptions?: object) {
  if (isHandlingInternalWriteFeedback()) {
    return;
  }

  if (!envConfig.noPackageName && packageNameState === 'pending') {
    pendingLogs.push({
      args: args.slice(),
      level,
      customOptions,
      fileInfo: captureFileInfo(),
    });
    return;
  }

  emitConsoleJsonLog(args, level, customOptions);
}

registerInternalCallerFunction(logUsingConsoleJson);

function supressDetailsIfSelected(errorObject: ErrorWithContext | undefined) {
  if (errorObject === undefined) {
    return undefined;
  }

  if (envConfig.noStackForNonError) {
    delete (errorObject as any)['@logCallStack'];
  }

  if (envConfig.noFileName) {
    delete (errorObject as any)['@filename'];
  }

  if (envConfig.noPackageName) {
    delete (errorObject as any)['@packageName'];
  }

  if (envConfig.noLoggerDebug) {
    delete (errorObject as any)._loggerDebug;
  }

  return errorObject;
}

/**
 * Each level is given a specific integer priority.
 * The higher the priority the more important the message is considered to be,
 * and the lower the corresponding integer priority.
 * For example, as specified exactly
 * in RFC5424 the syslog levels are prioritized from 0 to 7 (highest to lowest).
 */
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

export function LoggerRestoreConsole() {
  if (consoleErrorBackup != null) {
    console.error = consoleErrorBackup;
  }
  if (consoleWarningBackup != null) {
    console.warn = consoleWarningBackup;
  }
  if (consoleInfoBackup != null) {
    console.info = consoleInfoBackup;
  }

  if (consoleHttpBackup != null) {
    console.http = consoleHttpBackup;
  }

  if (consoleVerboseBackup != null) {
    console.verbose = consoleVerboseBackup;
  }

  if (consoleDebugBackup != null) {
    console.debug = consoleDebugBackup;
  }

  if (consoleSillyBackup != null) {
    console.silly = consoleSillyBackup;
  }

  if (consoleLogBackup != null) {
    console.log = consoleLogBackup;
  }
}

function extractParametersFromArguments(args: any[]) {
  let message = '';
  let errorObject: ErrorWithContext | undefined;
  let extraContext: object | undefined;
  let errorObjectWasPassed = false;
  let extraContextWasPassed = false;

  const nullOrUndefinedCount = filterNullOrUndefinedParameters(args);

  args.forEach((f: any) => {
    // String, number, or boolean parameter
    if (typeof f === 'string' || typeof f === 'number' || typeof f === 'boolean') {
      message = `${message}${message.length > 0 ? ' - ' : ''}${f}`;
    }
    // Error Object parameter
    else if (
      typeof f === 'object' &&
      // f.name === 'Error' &&
      (typeof f.message as any) === 'string' &&
      (typeof f.stack as any) === 'string' &&
      f.stack.length > 0
    ) {
      errorObject = f;
    }
    // Extra Context object parameter
    else if (typeof f === 'object' && f.name !== 'Error' && f.stack === undefined) {
      if (extraContext == null) {
        extraContext = f;
      } else {
        extraContext = safeObjectAssign(extraContext, ['message'], f);
      }
    }
  });

  // if we have extra context we must either wrap it into an existing error object or, pass it dry
  if (extraContext !== undefined) {
    const extraContextMessage = (extraContext as any).message;
    if (typeof extraContextMessage === 'string') {
      if (extraContextMessage.length > 0) {
        message = message.length > 0 ? `${message} - ${extraContextMessage}` : extraContextMessage;
      }
      delete (extraContext as any).message;
    } else if (extraContextMessage != null && typeof extraContextMessage === 'object') {
      (extraContext as any)['@messageObject'] = safeObjectAssign({}, [], extraContextMessage);
      delete (extraContext as any).message;
    }

    // noinspection JSUnusedAssignment
    extraContext = sortObject(extraContext);

    // When contextKey is set, wrap user context under that key to keep the top level clean
    if (envConfig.contextKey) {
      const userContextKeys = Object.keys(extraContext).filter((k: string) => !['@filename', '@logCallStack', '@packageName'].includes(k));
      if (userContextKeys.length > 0) {
        const userContext: any = {};
        const metadataContext: any = {};
        for (const k of Object.keys(extraContext)) {
          if (['@filename', '@logCallStack', '@packageName'].includes(k)) {
            metadataContext[k] = (extraContext as any)[k];
          } else {
            userContext[k] = (extraContext as any)[k];
          }
        }
        extraContext = { ...metadataContext, [envConfig.contextKey]: userContext };
      }
    }

    if (errorObject === undefined) {
      errorObjectWasPassed = false;
      // pass it dry
      errorObject = extraContext as any;
    } else {
      errorObjectWasPassed = true;
      // wrap it into existing error object
      // noinspection JSUnusedAssignment
      if (errorObject.name != null && errorObject.name.length > 0) {
        // noinspection JSUnusedAssignment
        extraContext = safeObjectAssign(extraContext, ['message'], { '@errorObjectName': errorObject.name });
      }
      // noinspection JSUnusedAssignment
      errorObject = new ErrorWithContext(errorObject, extraContext);
    }
  }

  if (nullOrUndefinedCount > 0 && message.length === 0) {
    message = '<value-passed-to-console-log-json-was-null>';
  }

  // check if user defined extra context was passed
  if (extraContext) {
    const knownExtraContextKeys: string[] = ['@filename', '@logCallStack', '@packageName'];
    const knownFiltered = Object.keys(extraContext).filter((f: string) => !knownExtraContextKeys.includes(f));
    if (knownFiltered.length > 0) {
      extraContextWasPassed = true;
    }
  }

  if (nullOrUndefinedCount === 0 && message.length === 0 && !errorObjectWasPassed && !extraContextWasPassed) {
    message = '<nothing-was-passed-to-console-log>';
  }

  return { message, errorObject };
}

export function overrideStdOut() {
  const output: string[] = [];
  if (typeof process !== 'undefined' && process.stdout) {
    const originalWrite = process.stdout.write;
    (process.stdout.write as any) = (...text: string[]): void => {
      output.push(text[0]);
    };
    return { originalWrite, outputText: output };
  }
  // Browser fallback: no-op
  return { originalWrite: null, outputText: output };
}

export function restoreStdOut(originalWrite: any) {
  if (originalWrite != null && typeof process !== 'undefined' && process.stdout) {
    (process.stdout.write as any) = originalWrite;
  }
}
