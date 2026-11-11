/* tslint:disable:object-literal-sort-keys */
import './logger-support/runtime-bootstrap';

import { getCallStackFromString } from './get-call-stack';
import { getCallingFilename, registerInternalCallerFunction } from './get-calling-filename';
import { jsonStringifySafe } from './json-stringify-safe/stringify-safe';
import { getPackageNameAsync, getPackageNameSync } from './package-name';
import { compileRedactor, Redactor } from './redact';
import { conflictResolutionPrefix } from './safe-object-assign';
import {
  buildEnvOptionOverrides,
  createConfiguredEnvValueGetter,
  createDefaultLoggerEnvironmentConfig,
  loadLoggerEnvironmentConfig,
  normalizeLogLevelValue,
  resolveLoggerAdaptToConsoleOptions,
} from './logger-support/config';
import { extractExplicitLogLevel, extractParametersFromArguments, hasErrorArgument, isErrorLikeObject, suppressMetadataIfConfigured } from './logger-support/argument-parsing';
import {
  nativeConsoleLog,
  captureConsoleMethodBackups,
  isHandlingInternalWriteFeedback,
  logLastResortProcessingError,
  patchConsoleMethod,
  restoreConsoleMethodBackups,
  writeOutput,
} from './logger-support/console-state';
import { createExtendedConsoleMethods, EXTENDED_CONSOLE_METHOD_NAMES } from './logger-support/console-methods';
import { buildFormattedLogObject, formatErrorObject, formatLogObjectForOutput } from './logger-support/formatting';
import {
  LOG_LEVEL,
  LOG_LEVEL_PRIORITY,
  LoggerAdaptToConsoleOptions,
  LoggerEnvironmentConfig,
  OnLogCallback,
  OnLogContext,
  ResolvedLoggerAdaptToConsoleOptions,
} from './logger-support/types';

export { LOG_LEVEL, LoggerAdaptToConsoleOptions, OnLogCallback, OnLogContext } from './logger-support/types';

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

let onLogCallback: OnLogCallback | null = null;
let onLogTimeoutMs = 5000;
let transformOutputCallback: ((parsedObject: any) => any) | null = null;
let redactor: Redactor | null = null;

let debugStringEnabled = false;
let customOptionsReference: { [key: string]: any } | null = null;
let customOptionKeys: string[] = [];

let packageName = '';
type PackageNameState = 'uninitialized' | 'pending' | 'ready' | 'unavailable';
/** Extra per-call behavior for the console methods that need it (trace, table, count, time...). */
export interface ConsoleJsonLogOptions {
  /** Always include @logCallStack, even with noStackForNonError (console.trace). */
  forceCallStack?: boolean;
  /** Logger-owned fields such as @table or @count. They stay top-level under contextKey. */
  metadata?: { [key: string]: any };
}
type EmitOptions = ConsoleJsonLogOptions & { customOptions?: object; fileInfo?: any | null; skipHooks: boolean };
type PendingLogEntry = { args: any[]; level: LOG_LEVEL; options: EmitOptions };
let packageNameState: PackageNameState = 'uninitialized';
let packageNameInitVersion = 0;
let pendingLogs: PendingLogEntry[] = [];

// Logs emitted from inside a user hook (transformOutput / onLog) are still written, but
// skip the hooks themselves; otherwise a hook that calls console.log would recurse forever
// (transformOutput) or loop endlessly (onLog).
//
// userHookDepth covers the synchronous part of a hook everywhere. Where AsyncLocalStorage
// exists (Node.js), hookContext also covers async continuations, e.g. a console.log after
// an `await` inside an async onLog.
let userHookDepth = 0;
const hookContext = createHookContext();

interface HookContext {
  run<T>(store: boolean, callback: () => T): T;
  getStore(): boolean | undefined;
}

function createHookContext(): HookContext | null {
  try {
    if (typeof require !== 'undefined') {
      const asyncHooks = require('async_hooks'); // tslint:disable-line:no-var-requires
      if (asyncHooks != null && typeof asyncHooks.AsyncLocalStorage === 'function') {
        return new asyncHooks.AsyncLocalStorage() as HookContext;
      }
    }
  } catch (_) {
    /* async_hooks not available (browser or minimal runtime) */
  }
  return null;
}

function runUserHook<T>(hook: () => T): T {
  userHookDepth += 1;
  try {
    return hookContext != null ? hookContext.run(true, hook) : hook();
  } finally {
    userHookDepth -= 1;
  }
}

function isInsideUserHook(): boolean {
  return userHookDepth > 0 || (hookContext != null && hookContext.getStore() === true);
}

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
  log(level: string, message: string, errorObject?: any, skipHooks: boolean = false): void {
    if (!shouldWriteLog(level, this._level)) {
      return;
    }

    const info = createLogInfo(level, message, errorObject);
    const sourceIsError = errorObject instanceof Error || isErrorLikeObject(errorObject);
    // `level` is already final (see resolveLogLevel), so a { level } override beats an Error.
    let outputObject = buildFormattedLogObject(info, envConfig, sourceIsError, false);

    if (!skipHooks) {
      outputObject = applyTransformOutput(outputObject);
    }
    outputObject = applyStructuredRedaction(outputObject);

    const runOnLog = onLogCallback != null && !skipHooks;
    const callbackJsonString = runOnLog || !envConfig.colorize ? jsonStringifySafe(outputObject) : null;
    const formattedOutput = formatLogObjectForOutput(outputObject, envConfig, callbackJsonString == null ? undefined : callbackJsonString);

    writeOutput(formattedOutput);
    if (runOnLog) {
      scheduleOnLogCallback(outputObject, callbackJsonString);
    }
  },
};

export function GetLogLevel() {
  return Logger.level;
}

export function SetLogLevel(level: string) {
  // Accept the same spellings as the logLevel option ('WARN', ' Info ', 'warning').
  // An unrecognized value leaves the current level unchanged.
  Logger.level = normalizeLogLevelValue(level, Logger.level as LOG_LEVEL);
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

export function logUsingConsoleJson(callerArgs: any[], methodLevel: LOG_LEVEL, customOptions?: object, consoleOptions: ConsoleJsonLogOptions = {}) {
  if (isHandlingInternalWriteFeedback()) {
    return;
  }

  // Work on a copy: the level override is replaced and metadata appended, and callers pass their own array.
  const args = callerArgs.slice();
  const level = resolveLogLevel(args, methodLevel);
  const options: EmitOptions = { ...consoleOptions, customOptions, skipHooks: isInsideUserHook() };

  if (shouldBufferUntilPackageNameResolves()) {
    // Capture the stack now: by the time the buffered log is written it would point at the flush.
    options.fileInfo = captureFileInfo(shouldIncludeCallStack(level, options));
    pendingLogs.push({ args, level, options });
    return;
  }

  emitConsoleJsonLog(args, level, options);
}

/**
 * The level the log is written at: a `{ level }` override if there is one, otherwise `error` when an
 * Error is among the arguments, otherwise the console method's level. Removes the override from `args`.
 */
function resolveLogLevel(args: any[], methodLevel: LOG_LEVEL): LOG_LEVEL {
  try {
    const explicitLevel = extractExplicitLogLevel(args);
    if (explicitLevel != null) {
      return explicitLevel;
    }
    return hasErrorArgument(args) ? LOG_LEVEL.error : methodLevel;
  } catch (_) {
    return methodLevel;
  }
}

function shouldKeepCallStack(level: LOG_LEVEL, options: EmitOptions): boolean {
  return level === LOG_LEVEL.error || options.forceCallStack === true;
}

function shouldIncludeCallStack(level: LOG_LEVEL, options: EmitOptions): boolean {
  return !envConfig.noStackForNonError || shouldKeepCallStack(level, options);
}

registerInternalCallerFunction(logUsingConsoleJson);

export function LoggerRestoreConsole() {
  restoreConsoleMethodBackups();
}

export function NativeConsoleLog(...args: any[]) {
  nativeConsoleLog(...args);
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
  if (Object.prototype.hasOwnProperty.call(errorObject, 'level') && errorObject.level !== level) {
    // A context field named `level` that isn't a level override (e.g. { level: 5 }) would be
    // overwritten by the log level. Keep it under `_level`, the same rename safeObjectAssign
    // applies to every other conflicting key.
    let preservedKey = `${conflictResolutionPrefix}level`;
    while (preservedKey in info) {
      preservedKey = `${conflictResolutionPrefix}${preservedKey}`;
    }
    info[preservedKey] = errorObject.level;
  }
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
    const transform = transformOutputCallback;
    // A copy, so a transform that changes the object and then throws can't alter the fallback.
    const workingCopy = cloneForMutation(outputObject);
    const transformed = runUserHook(() => transform(workingCopy));
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
    // JavaScript can't stop a running callback, so the timeout aborts a signal the callback can
    // pass on (e.g. fetch(url, { signal })). AbortController is missing on Node < 15.
    const abortController = createAbortController();
    const hookContextArg: OnLogContext = abortController != null ? { signal: abortController.signal } : {};
    // The timer must not keep the process alive past the end of the program.
    const timeoutId: any = setTimeout(() => {
      if (abortController != null) {
        try {
          abortController.abort();
        } catch (_) {
          /* a listener threw — ignore */
        }
      }
    }, timeout);
    if (timeoutId != null && typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    const invoke = () => {
      Promise.resolve()
        .then(() => runUserHook(() => callback(jsonString, parsedCopy, hookContextArg)))
        .then(() => clearTimeout(timeoutId))
        .catch(() => clearTimeout(timeoutId));
    };

    if (hookContext == null && typeof setTimeout === 'function') {
      // Without AsyncLocalStorage (browsers), a log made after an `await` inside onLog can't
      // be told apart from an ordinary log, so it runs onLog again. Starting each callback
      // as a macrotask keeps such a loop from starving the event loop and freezing the page.
      setTimeout(invoke, 0);
    } else {
      invoke();
    }
  } catch (_) {
    /* interceptor error — silently ignore */
  }
}

function createAbortController(): AbortController | null {
  try {
    return typeof AbortController === 'function' ? new AbortController() : null;
  } catch (_) {
    return null;
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

  // Named with the consoleJson prefix so stack filtering skips it in bundles.
  const consoleJsonForward = (args: any[], level: LOG_LEVEL, consoleOptions?: ConsoleJsonLogOptions) => logUsingConsoleJson(args, level, customOptions, consoleOptions);
  registerInternalCallerFunction(consoleJsonForward);
  const extendedMethods = createExtendedConsoleMethods(consoleJsonForward);
  for (const methodName of EXTENDED_CONSOLE_METHOD_NAMES) {
    const patchedMethod = extendedMethods[methodName];
    patchConsoleMethod(methodName, patchedMethod);
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
    emitConsoleJsonLog(pendingLog.args, pendingLog.level, pendingLog.options);
  }
}

function shouldBufferUntilPackageNameResolves(): boolean {
  return !envConfig.noPackageName && packageNameState === 'pending';
}

/** @param args the caller's arguments, already copied by logUsingConsoleJson(); appended to here. */
function emitConsoleJsonLog(args: any[], level: LOG_LEVEL, options: EmitOptions) {
  appendPackageNameMetadata(args);
  appendDebugMetadata(args);
  appendFileMetadata(args, options.fileInfo !== undefined ? options.fileInfo : captureFileInfo(shouldIncludeCallStack(level, options)));
  if (options.metadata != null) {
    args.push(options.metadata);
  }

  try {
    if ((console as any).exception != null) {
      (console as any).exception();
    }

    const { message, errorObject } = extractParametersFromArguments(args, envConfig, getRuntimeCustomOptions(options.customOptions));
    Logger.log(level, message, suppressMetadataIfConfigured(errorObject, envConfig, shouldKeepCallStack(level, options)), options.skipHooks);
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

    args.push({ _loggerDebug: args.map(debugStringify) });
  } catch (err: any) {
    args.push({ _loggerDebug: `err ${err.message}` });
  }
}

function debugStringify(value: any): string {
  if (value == null) {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value, Object.getOwnPropertyNames(value));
    return serialized === undefined ? String(value) : serialized;
  } catch (_) {
    // BigInt or circular values: jsonStringifySafe handles both.
    try {
      const safeSerialized = jsonStringifySafe(value);
      return safeSerialized === undefined ? String(value) : safeSerialized;
    } catch (__) {
      return String(value);
    }
  }
}

function appendFileMetadata(args: any[], fileInfo: any | null): void {
  if (fileInfo != null) {
    args.push(fileInfo);
  }
}

/** The customOptions for this log, copied so a getter or later mutation can't break the merge. */
function getRuntimeCustomOptions(customOptions?: object): { [key: string]: any } | null {
  try {
    const runtimeCustomOptions = customOptionsReference || (customOptions ? (customOptions as { [key: string]: any }) : null);
    if (!runtimeCustomOptions) {
      return null;
    }

    const keys = customOptionsReference ? customOptionKeys : Object.keys(runtimeCustomOptions);
    const copy: { [key: string]: any } = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(runtimeCustomOptions, key)) {
        copy[key] = runtimeCustomOptions[key];
      }
    }
    return copy;
  } catch (err: any) {
    return { _customOptionsError: `err ${err.message}` };
  }
}

/** @param includeCallStack false for non-error logs when noStackForNonError is set. */
function captureFileInfo(includeCallStack: boolean): any | null {
  if (envConfig.noFileName && !includeCallStack) {
    return null;
  }

  try {
    const sharedStack = new Error().stack || '';
    const fileName = !envConfig.noFileName ? getCallingFilename(sharedStack) : null;
    const callStack = includeCallStack ? getCallStackFromString(sharedStack) : undefined;
    const fileInfo: any = {};

    if (!envConfig.noFileName) {
      fileInfo['@filename'] = fileName || '<unknown>';
    }

    if (includeCallStack) {
      fileInfo['@logCallStack'] = callStack;
    }

    return fileInfo;
  } catch (err: any) {
    return { '@filename': `<error>:${err.message}`, '@logCallStack': err.message };
  }
}
