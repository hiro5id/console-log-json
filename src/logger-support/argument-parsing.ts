import { ErrorWithContext, wrapErrorKeepingStack } from '../error-with-context';
import { safeObjectAssign } from '../safe-object-assign';
import { parseLogLevelValue } from './config';
import { LOG_LEVEL, LoggerEnvironmentConfig } from './types';

// Fields the logger adds itself. They stay at the top level when contextKey nests user context,
// and don't count as "something was passed".
const LOGGER_METADATA_KEYS = ['@filename', '@logCallStack', '@packageName', '@table', '@count', '@label', '@durationMs'];

/**
 * Finds a `{ level: '...' }` override (the first argument object whose first key is `level` and whose
 * value is a recognized level), replaces it in `args` with a copy without the `level` key, and returns
 * the level. Returns null when there is no override; `args` is then unchanged.
 */
export function extractExplicitLogLevel(args: any[]): LOG_LEVEL | null {
  let resolvedLevel: LOG_LEVEL | null = null;
  let foundLevel = false;

  args.forEach((entry: any, index: number) => {
    if (foundLevel || entry == null || typeof entry !== 'object' || Object.keys(entry).length === 0 || Object.keys(entry)[0].toLowerCase() !== 'level') {
      return;
    }
    if (entry instanceof Error || isErrorLikeObject(entry)) {
      // A `level` property on an error is data about the error, not an override.
      return;
    }

    const levelKey = Object.keys(entry)[0];
    const explicitLevel = parseLogLevelValue(entry[levelKey]);
    if (explicitLevel == null) {
      // Not a level override, just context that happens to have a `level` field
      // (e.g. { level: 5 }). Keep it as data and keep the console method's level.
      return;
    }

    resolvedLevel = explicitLevel;
    // Drop the level key from a copy, never from the caller's own object.
    args[index] = copyWithoutKey(entry, levelKey);
    foundLevel = true;
  });

  return resolvedLevel;
}

export function hasErrorArgument(args: any[]): boolean {
  return args.some((entry) => entry instanceof Error || isErrorLikeObject(entry));
}

/**
 * Shallow copy that keeps the prototype (so Errors stay Errors) and property enumerability.
 *
 * Values are read through the original object, not copied as descriptors: since V8 12
 * (Node.js 22), an error's `stack` is an own accessor whose getter only works on the
 * original error, so a descriptor copy would have `stack === undefined`.
 */
function copyWithoutKey(source: any, keyToDrop: string): any {
  const copy = Object.create(Object.getPrototypeOf(source));
  for (const key of Reflect.ownKeys(source)) {
    if (key === keyToDrop) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    let value: any;
    try {
      value = source[key];
    } catch (_) {
      continue; // a throwing getter: leave the property out
    }
    Object.defineProperty(copy, key, { value, writable: true, configurable: true, enumerable: descriptor != null && descriptor.enumerable === true });
  }
  return copy;
}

/**
 * @param customOptions merged at the top level after contextKey nesting, so they are never nested
 * under the context key. On a key collision the call's own context keeps the name and the custom
 * option is renamed with the `_` prefix.
 */
export function extractParametersFromArguments(
  args: any[],
  envConfig: LoggerEnvironmentConfig,
  customOptions?: object | null,
): {
  message: string;
  errorObject: ErrorWithContext | undefined;
} {
  let message = '';
  let errorObject: ErrorWithContext | undefined;
  let extraContext: object | undefined;
  let errorObjectWasPassed = false;
  let extraContextWasPassed = false;

  const nullOrUndefinedCount = filterNullOrUndefinedParameters(args);

  args.forEach((entry: any) => {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' || typeof entry === 'bigint') {
      message = appendMessageFragment(message, entry);
    } else if (isErrorLikeObject(entry)) {
      errorObject = entry;
    } else if (isContextObject(entry)) {
      extraContext = mergeExtraContext(extraContext, entry);
    }
  });

  const hasCustomOptions = customOptions != null && Object.keys(customOptions).length > 0;
  if (extraContext === undefined && hasCustomOptions) {
    extraContext = {};
  }

  if (extraContext !== undefined) {
    let normalizedContext = normalizeExtraContext(extraContext, envConfig);
    if (hasCustomOptions) {
      normalizedContext = safeObjectAssign(normalizedContext, ['message'], customOptions);
    }
    extraContext = normalizedContext;
    const normalizedContextMessage = (normalizedContext as any).message;

    if (typeof normalizedContextMessage === 'string') {
      if (normalizedContextMessage.length > 0) {
        message = appendMessageFragment(message, normalizedContextMessage);
      }
      delete (normalizedContext as any).message;
    } else if (normalizedContextMessage != null && typeof normalizedContextMessage === 'object') {
      (normalizedContext as any)['@messageObject'] = safeObjectAssign({}, [], normalizedContextMessage);
      delete (normalizedContext as any).message;
    }

    if (errorObject === undefined) {
      errorObjectWasPassed = false;
      errorObject = normalizedContext as any;
    } else {
      errorObjectWasPassed = true;
      if (errorObject.name != null && errorObject.name.length > 0) {
        extraContext = safeObjectAssign(normalizedContext, ['message'], { '@errorObjectName': errorObject.name });
      } else {
        extraContext = normalizedContext;
      }
      errorObject = wrapErrorKeepingStack(errorObject, extraContext as object);
    }
  }

  if (nullOrUndefinedCount > 0 && message.length === 0) {
    message = '<value-passed-to-console-log-json-was-null>';
  }

  if (extraContext !== undefined) {
    const nonMetadataKeys = Object.keys(extraContext).filter((key) => !LOGGER_METADATA_KEYS.includes(key));
    if (nonMetadataKeys.length > 0) {
      extraContextWasPassed = true;
    }
  }

  // An error passed on its own (no context, e.g. with all metadata disabled) is never wrapped,
  // so errorObjectWasPassed stays false; it still counts as something passed.
  const errorWasPassed = errorObjectWasPassed || errorObject instanceof Error || isErrorLikeObject(errorObject);
  if (nullOrUndefinedCount === 0 && message.length === 0 && !errorWasPassed && !extraContextWasPassed) {
    message = '<nothing-was-passed-to-console-log>';
  }

  return { message, errorObject };
}

/**
 * @param keepCallStack true for error logs (and console.trace): noStackForNonError then leaves @logCallStack in place.
 */
export function suppressMetadataIfConfigured(
  errorObject: ErrorWithContext | undefined,
  envConfig: LoggerEnvironmentConfig,
  keepCallStack: boolean = false,
): ErrorWithContext | undefined {
  if (errorObject === undefined) {
    return undefined;
  }

  if (envConfig.noStackForNonError && !keepCallStack) {
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

function appendMessageFragment(message: string, fragment: string | number | boolean | bigint): string {
  return `${message}${message.length > 0 ? ' - ' : ''}${fragment}`;
}

export function isErrorLikeObject(value: any): boolean {
  return value != null && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string' && value.stack.length > 0;
}

function isContextObject(value: any): boolean {
  // Anything that isn't an error is context, including plain objects that happen
  // to have a `stack` or `name` property (e.g. { stack: 'prod-eu' }).
  return value != null && typeof value === 'object' && !(value instanceof Error);
}

function mergeExtraContext(existingContext: object | undefined, nextContext: object): object {
  if (existingContext == null) {
    return nextContext;
  }
  return safeObjectAssign(existingContext, ['message'], nextContext);
}

function normalizeExtraContext(extraContext: object, envConfig: LoggerEnvironmentConfig): object {
  // Deep copy with keys sorted at every level (and circular references replaced). Merging two
  // objects already did this; a single context object must come out the same way.
  let normalizedContext: any = safeObjectAssign({}, [], extraContext);

  if (!envConfig.contextKey) {
    return normalizedContext;
  }

  const userContextKeys = Object.keys(normalizedContext).filter((key) => !LOGGER_METADATA_KEYS.includes(key));
  if (userContextKeys.length === 0) {
    return normalizedContext;
  }

  const metadataContext: any = {};
  const userContext: any = {};

  for (const key of Object.keys(normalizedContext)) {
    if (LOGGER_METADATA_KEYS.includes(key)) {
      metadataContext[key] = normalizedContext[key];
    } else {
      userContext[key] = normalizedContext[key];
    }
  }

  normalizedContext = { ...metadataContext, [envConfig.contextKey]: userContext };
  return normalizedContext;
}
