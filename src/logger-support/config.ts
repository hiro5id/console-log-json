import { getEnv } from '../get-env';
import { configureNewLineCharacter } from '../new-line-character';
import { RedactOptions } from '../redact';
import { LOGGER_ENV_VARS, LOG_LEVEL, LOG_LEVEL_PRIORITY, LoggerAdaptToConsoleOptions, LoggerEnvironmentConfig, ResolvedLoggerAdaptToConsoleOptions } from './types';

type AnyFunction = (...args: any[]) => any;
type ConfiguredEnvValueGetter = (envVarName: string) => any;

export function createDefaultLoggerEnvironmentConfig(): LoggerEnvironmentConfig {
  return {
    noNewLineCharacters: false,
    noNewLineCharactersExceptStack: false,
    noTimeStamp: false,
    disableAutoParse: false,
    colorize: false,
    noStackForNonError: false,
    noFileName: false,
    noPackageName: false,
    noLoggerDebug: false,
    contextKey: '',
  };
}

export function createConfiguredEnvValueGetter(envOptionOverrides: Record<string, any>): ConfiguredEnvValueGetter {
  return (envVarName: string): any => {
    if (envVarName in envOptionOverrides) {
      return envOptionOverrides[envVarName];
    }
    return getEnv(envVarName);
  };
}

export function loadLoggerEnvironmentConfig(getConfiguredEnvValue: ConfiguredEnvValueGetter): LoggerEnvironmentConfig {
  const config = {
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

  configureNewLineCharacter(config.noNewLineCharacters);
  return config;
}

export function buildEnvOptionOverrides(options?: LoggerAdaptToConsoleOptions): Record<string, any> {
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

export function resolveLoggerAdaptToConsoleOptions(
  options: LoggerAdaptToConsoleOptions | undefined,
  getConfiguredEnvValue: ConfiguredEnvValueGetter,
): ResolvedLoggerAdaptToConsoleOptions {
  return {
    logLevel: normalizeLogLevelValue(resolveOptionValue(options?.logLevel, LOGGER_ENV_VARS.logLevel, getConfiguredEnvValue), LOG_LEVEL.info),
    debugString: isTrue(resolveOptionValue(options?.debugString, LOGGER_ENV_VARS.debugString, getConfiguredEnvValue)),
    customOptions: normalizeCustomOptionsValue(resolveOptionValue(options?.customOptions, LOGGER_ENV_VARS.customOptions, getConfiguredEnvValue)),
    onLog: normalizeFunctionValue<(jsonString: string, parsedObject: any) => void>(resolveOptionValue(options?.onLog, LOGGER_ENV_VARS.onLog, getConfiguredEnvValue)),
    onLogTimeout: normalizeTimeoutValue(resolveOptionValue(options?.onLogTimeout, LOGGER_ENV_VARS.onLogTimeout, getConfiguredEnvValue), 5000),
    transformOutput: normalizeFunctionValue<(parsedObject: any) => any>(resolveOptionValue(options?.transformOutput, LOGGER_ENV_VARS.transformOutput, getConfiguredEnvValue)),
    redact: normalizeRedactValue(resolveOptionValue(options?.redact, LOGGER_ENV_VARS.redact, getConfiguredEnvValue)),
  };
}

export function normalizeLogLevelValue(value: any, defaultLevel: LOG_LEVEL = LOG_LEVEL.info): LOG_LEVEL {
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

function applyIfDefined(target: Record<string, any>, envVarName: string, value: any): void {
  if (value !== undefined) {
    target[envVarName] = value;
  }
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

function resolveOptionValue(directValue: any, envVarName: string, getConfiguredEnvValue: ConfiguredEnvValueGetter): any {
  if (directValue !== undefined) {
    return directValue;
  }
  return getConfiguredEnvValue(envVarName);
}
