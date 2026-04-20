/* tslint:disable:object-literal-sort-keys */
import './logger-support/runtime-bootstrap';

import { getCallStackFromString } from './get-call-stack';
import { getCallingFilename, registerInternalCallerFunction } from './get-calling-filename';
import { jsonStringifySafe } from './json-stringify-safe/stringify-safe';
import { getPackageNameAsync, getPackageNameSync } from './package-name';
import { compileRedactor, Redactor } from './redact';
import {
  buildEnvOptionOverrides,
  createConfiguredEnvValueGetter,
  createDefaultLoggerEnvironmentConfig,
  loadLoggerEnvironmentConfig,
  resolveLoggerAdaptToConsoleOptions,
} from './logger-support/config';
import { extractParametersFromArguments, findExplicitLogLevelAndUseIt, suppressMetadataIfConfigured } from './logger-support/argument-parsing';
import {
  nativeConsoleLog,
  captureConsoleMethodBackups,
  isHandlingInternalWriteFeedback,
  logLastResortProcessingError,
  patchConsoleMethod,
  restoreConsoleMethodBackups,
  writeOutput,
} from './logger-support/console-state';
import { buildFormattedLogObject, formatErrorObject, formatLogObjectForOutput } from './logger-support/formatting';
import { LOG_LEVEL, LOG_LEVEL_PRIORITY, LoggerAdaptToConsoleOptions, LoggerEnvironmentConfig, ResolvedLoggerAdaptToConsoleOptions } from './logger-support/types';

export { LOG_LEVEL, LoggerAdaptToConsoleOptions } from './logger-support/types';

const CONSOLE_METHOD_LEVELS: { name: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly' | 'log'; level: LOG_LEVEL }[] = [
  { name: 'error', level: LOG_LEVEL.error },
  { name: 'warn', level: LOG_LEVEL.warn },
  { name: 'info', level: LOG_LEVEL.info },
  { name: 'http', level: LOG_LEVEL.http },
  { name: 'verbose', level: LOG_LEVEL.verbose },
  { name: 'debug', level: LOG_LEVEL.debug },
  { name: 'silly', level: LOG_LEVEL.silly },
  { name: 'log', level: LOG_LEVEL.info },
];

let envConfig: LoggerEnvironmentConfig = createDefaultLoggerEnvironmentConfig();
let envOptionOverrides: Record<string, any> = {};

let onLogCallback: ((jsonString: string, parsedObject: any) => void) | null = null;
let onLogTimeoutMs = 5000;
let transformOutputCallback: ((parsedObject: any) => any) | null = null;
let redactor: Redactor | null = null;

let debugStringEnabled = false;
let customOptionsReference: { [key: string]: any } | null = null;
let customOptionKeys: string[] = [];

let packageName = '';
type PackageNameState = 'uninitialized' | 'pending' | 'ready' | 'unavailable';
type PendingLogEntry = { args: any[]; level: LOG_LEVEL; customOptions?: object; fileInfo?: any | null };
let packageNameState: PackageNameState = 'uninitialized';
let packageNameInitVersion = 0;
let pendingLogs: PendingLogEntry[] = [];

export function FormatErrorObject(object: any) {
  return formatErrorObject(object, envConfig);
}

export function loadEnvConfig() {
  envConfig = loadLoggerEnvironmentConfig(getConfiguredEnvValue);
}

const Logger = {
  _level: LOG_LEVEL.info as string,
  get level(): string {
    return this._level;
  },
  set level(level: string) {
    this._level = level;
  },
  log(level: string, message: string, errorObject?: any): void {
    if (!shouldWriteLog(level, this._level)) {
      return;
    }

    const info = createLogInfo(level, message, errorObject);
    let outputObject = buildFormattedLogObject(info, envConfig);

    outputObject = applyTransformOutput(outputObject);
    outputObject = applyStructuredRedaction(outputObject);

    const callbackJsonString = onLogCallback || !envConfig.colorize ? jsonStringifySafe(outputObject) : null;
    const formattedOutput = formatLogObjectForOutput(outputObject, envConfig, callbackJsonString == null ? undefined : callbackJsonString);

    writeOutput(formattedOutput);
    scheduleOnLogCallback(outputObject, callbackJsonString);
  },
};

export function GetLogLevel() {
  return Logger.level;
}

export function SetLogLevel(level: string) {
  Logger.level = level;
}

/**
 * This function adapts a logger to the console.
 *
 * @param {LoggerAdaptToConsoleOptions} [options] - An optional parameter that can configure log level, formatting flags, debug output, extra context, structured redaction, and lifecycle hooks.
 */
export function LoggerAdaptToConsole(options?: LoggerAdaptToConsoleOptions) {
  envOptionOverrides = buildEnvOptionOverrides(options);
  const resolvedOptions = resolveLoggerAdaptToConsoleOptions(options, getConfiguredEnvValue);

  applyResolvedOptions(resolvedOptions);
  loadEnvConfig();
  initializePackageNameState();
  Logger.level = resolvedOptions.logLevel;

  captureConsoleMethodBackups();
  patchConsoleMethods(resolvedOptions.customOptions || undefined);
}

export function logUsingConsoleJson(args: any[], level: LOG_LEVEL, customOptions?: object) {
  if (isHandlingInternalWriteFeedback()) {
    return;
  }

  if (shouldBufferUntilPackageNameResolves()) {
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

export function LoggerRestoreConsole() {
  restoreConsoleMethodBackups();
}

export function NativeConsoleLog(...args: any[]) {
  nativeConsoleLog(...args);
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

  return { originalWrite: null, outputText: output };
}

export function restoreStdOut(originalWrite: any) {
  if (originalWrite != null && typeof process !== 'undefined' && process.stdout) {
    (process.stdout.write as any) = originalWrite;
  }
}

function getConfiguredEnvValue(envVarName: string): any {
  return createConfiguredEnvValueGetter(envOptionOverrides)(envVarName);
}

function shouldWriteLog(messageLevel: string, configuredLevel: string): boolean {
  const messagePriority = LOG_LEVEL_PRIORITY[messageLevel] != null ? LOG_LEVEL_PRIORITY[messageLevel] : LOG_LEVEL_PRIORITY.info;
  const configuredPriority = LOG_LEVEL_PRIORITY[configuredLevel] != null ? LOG_LEVEL_PRIORITY[configuredLevel] : LOG_LEVEL_PRIORITY.info;
  return messagePriority <= configuredPriority;
}

function createLogInfo(level: string, message: string, errorObject?: any): any {
  const info: any = { level, message };

  if (errorObject == null) {
    return info;
  }

  Object.assign(info, errorObject);
  info.level = level;

  if (errorObject instanceof Error) {
    copyErrorPropertiesToInfo(info, errorObject, message);
  }

  return info;
}

function copyErrorPropertiesToInfo(info: any, errorObject: Error, fallbackMessage: string): void {
  for (const key of Object.getOwnPropertyNames(errorObject)) {
    if (key === 'message') {
      if (errorObject.message && errorObject.message !== fallbackMessage) {
        info.message = fallbackMessage.length > 0 ? `${fallbackMessage} ${errorObject.message}` : errorObject.message;
      }
    } else if (!(key in info)) {
      info[key] = (errorObject as any)[key];
    }
  }

  if (errorObject.stack) {
    info.stack = errorObject.stack;
  }
}

function applyTransformOutput(outputObject: any): any {
  if (!transformOutputCallback) {
    return outputObject;
  }

  try {
    const transformed = transformOutputCallback(outputObject);
    if (transformed != null && typeof transformed === 'object') {
      return transformed;
    }
  } catch (_) {
    /* transform error — use original formatted output */
  }

  return outputObject;
}

function applyStructuredRedaction(outputObject: any): any {
  if (!redactor) {
    return outputObject;
  }

  try {
    const clonedOutput = cloneForMutation(outputObject);
    redactor.redact(clonedOutput);
    return clonedOutput;
  } catch (_) {
    return outputObject;
  }
}

function scheduleOnLogCallback(outputObject: any, callbackJsonString: string | null): void {
  if (!onLogCallback) {
    return;
  }

  const callback = onLogCallback;
  const timeout = onLogTimeoutMs;

  try {
    const jsonString = callbackJsonString == null ? jsonStringifySafe(outputObject) : callbackJsonString;
    const parsedCopy = JSON.parse(jsonString);
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

function applyResolvedOptions(resolvedOptions: ResolvedLoggerAdaptToConsoleOptions): void {
  onLogCallback = resolvedOptions.onLog;
  onLogTimeoutMs = resolvedOptions.onLogTimeout;
  transformOutputCallback = resolvedOptions.transformOutput;
  redactor = compileRedactor(resolvedOptions.redact);
  debugStringEnabled = resolvedOptions.debugString;
  customOptionsReference = resolvedOptions.customOptions;
  customOptionKeys = customOptionsReference ? Object.keys(customOptionsReference) : [];
}

function patchConsoleMethods(customOptions?: { [key: string]: any }): void {
  for (const consoleMethod of CONSOLE_METHOD_LEVELS) {
    const patchedMethod = (...args: any[]) => {
      return logUsingConsoleJson(args, consoleMethod.level, customOptions);
    };

    patchConsoleMethod(consoleMethod.name, patchedMethod);
    registerInternalCallerFunction(patchedMethod as any);
  }
}

function initializePackageNameState(): void {
  packageName = '';
  packageNameState = 'uninitialized';
  startPackageNameInitialization();
}

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

function shouldBufferUntilPackageNameResolves(): boolean {
  return !envConfig.noPackageName && packageNameState === 'pending';
}

function emitConsoleJsonLog(args: any[], level: LOG_LEVEL, customOptions?: object, fileInfo?: any | null) {
  appendPackageNameMetadata(args);
  appendDebugMetadata(args);
  appendFileMetadata(args, fileInfo);
  appendRuntimeCustomOptions(args, customOptions);

  try {
    const effectiveLevel = findExplicitLogLevelAndUseIt(args, level);

    if ((console as any).exception != null) {
      (console as any).exception();
    }

    const { message, errorObject } = extractParametersFromArguments(args, envConfig);
    Logger.log(effectiveLevel, message, suppressMetadataIfConfigured(errorObject, envConfig));
  } catch (err: any) {
    logLastResortProcessingError('console.log', err);
  }
}

function appendPackageNameMetadata(args: any[]): void {
  if (envConfig.noPackageName) {
    return;
  }

  if (packageNameState === 'ready' && packageName.length > 0) {
    args.push({ '@packageName': packageName });
  }
}

function appendDebugMetadata(args: any[]): void {
  if (!debugStringEnabled) {
    return;
  }

  try {
    if ((console as any).debugStringException != null) {
      (console as any).debugStringException();
    }

    let argsStringArray = args.map((value) => JSON.stringify(value, Object.getOwnPropertyNames(value)));
    if (!argsStringArray) {
      argsStringArray = [];
    }
    args.push({ _loggerDebug: argsStringArray });
  } catch (err: any) {
    args.push({ _loggerDebug: `err ${err.message}` });
  }
}

function appendFileMetadata(args: any[], fileInfo?: any | null): void {
  const effectiveFileInfo = fileInfo !== undefined ? fileInfo : captureFileInfo();
  if (effectiveFileInfo != null) {
    args.push(effectiveFileInfo);
  }
}

function appendRuntimeCustomOptions(args: any[], customOptions?: object): void {
  try {
    const runtimeCustomOptions = customOptionsReference || (customOptions ? (customOptions as { [key: string]: any }) : null);
    const runtimeCustomOptionKeys = customOptionsReference ? customOptionKeys : runtimeCustomOptions ? Object.keys(runtimeCustomOptions) : [];

    if (!runtimeCustomOptions) {
      return;
    }

    for (const key of runtimeCustomOptionKeys) {
      if (Object.prototype.hasOwnProperty.call(runtimeCustomOptions, key)) {
        const customOptionFragment: { [key: string]: any } = {};
        customOptionFragment[key] = runtimeCustomOptions[key];
        args.push(customOptionFragment);
      }
    }
  } catch (err: any) {
    args.push({ _customOptionsError: `err ${err.message}` });
  }
}

function captureFileInfo(): any | null {
  if (envConfig.noFileName && envConfig.noStackForNonError) {
    return null;
  }

  try {
    const sharedStack = new Error().stack || '';
    const fileName = !envConfig.noFileName ? getCallingFilename(sharedStack) : null;
    const callStack = !envConfig.noStackForNonError ? getCallStackFromString(sharedStack) : undefined;
    const fileInfo: any = {};

    if (!envConfig.noFileName) {
      fileInfo['@filename'] = fileName || '<unknown>';
    }

    if (!envConfig.noStackForNonError) {
      fileInfo['@logCallStack'] = callStack;
    }

    return fileInfo;
  } catch (err: any) {
    return { '@filename': `<error>:${err.message}`, '@logCallStack': err.message };
  }
}
