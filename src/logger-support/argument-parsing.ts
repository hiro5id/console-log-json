import { ErrorWithContext } from '../error-with-context';
import { safeObjectAssign } from '../safe-object-assign';
import { sortObject } from '../sort-object';
import { normalizeLogLevelValue } from './config';
import { LOG_LEVEL, LoggerEnvironmentConfig } from './types';

const LOGGER_METADATA_KEYS = ['@filename', '@logCallStack', '@packageName'];

export function findExplicitLogLevelAndUseIt(args: any[], defaultLevel: LOG_LEVEL): LOG_LEVEL {
  let resolvedLevel = defaultLevel;
  let foundLevel = false;

  args.forEach((entry: any) => {
    if (foundLevel || entry == null || typeof entry !== 'object' || Object.keys(entry).length === 0 || Object.keys(entry)[0].toLowerCase() !== 'level') {
      return;
    }

    const levelKey = Object.keys(entry)[0];
    resolvedLevel = normalizeLogLevelValue(entry[levelKey], LOG_LEVEL.info);
    delete entry[levelKey];
    foundLevel = true;
  });

  return resolvedLevel;
}

export function extractParametersFromArguments(
  args: any[],
  envConfig: LoggerEnvironmentConfig,
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
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      message = appendMessageFragment(message, entry);
    } else if (isErrorLikeObject(entry)) {
      errorObject = entry;
    } else if (isContextObject(entry)) {
      extraContext = mergeExtraContext(extraContext, entry);
    }
  });

  if (extraContext !== undefined) {
    const normalizedContext = normalizeExtraContext(extraContext, envConfig);
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
      errorObject = new ErrorWithContext(errorObject, extraContext as object);
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

  if (nullOrUndefinedCount === 0 && message.length === 0 && !errorObjectWasPassed && !extraContextWasPassed) {
    message = '<nothing-was-passed-to-console-log>';
  }

  return { message, errorObject };
}

export function suppressMetadataIfConfigured(errorObject: ErrorWithContext | undefined, envConfig: LoggerEnvironmentConfig): ErrorWithContext | undefined {
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

function appendMessageFragment(message: string, fragment: string | number | boolean): string {
  return `${message}${message.length > 0 ? ' - ' : ''}${fragment}`;
}

function isErrorLikeObject(value: any): boolean {
  return value != null && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string' && value.stack.length > 0;
}

function isContextObject(value: any): boolean {
  return value != null && typeof value === 'object' && value.name !== 'Error' && value.stack === undefined;
}

function mergeExtraContext(existingContext: object | undefined, nextContext: object): object {
  if (existingContext == null) {
    return nextContext;
  }
  return safeObjectAssign(existingContext, ['message'], nextContext);
}

function normalizeExtraContext(extraContext: object, envConfig: LoggerEnvironmentConfig): object {
  let normalizedContext: any = sortObject(extraContext);

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
