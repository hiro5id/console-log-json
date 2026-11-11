import { colorJson } from '../colors/colorize';
import { FormatStackTrace } from '../format-stack-trace';
import { jsonStringifySafe } from '../json-stringify-safe/stringify-safe';
import { NewLineCharacter } from '../new-line-character';
import { safeObjectAssign } from '../safe-object-assign';
import { ToOneLine } from '../to-one-line';
import { LoggerEnvironmentConfig } from './types';

const AUTO_PARSED_JSON_MESSAGE = '<auto-parsed-json-string-see-@autoParsedJson-property>';
const EMPTY_ERROR_MESSAGE = '<no-error-message-was-passed-to-console-log>';
const EMPTY_MESSAGE = '<no-message-was-passed-to-console-log>';

let stackMessageRegexCache: { separator: string; regex: RegExp } | null = null;

/**
 * @param sourceIsError false when `object` was built from plain context objects only. A `stack`
 * key in user context (e.g. { stack: 'prod-eu' }) is then ordinary data, not an error stack trace.
 * @param forceErrorLevel set `level` to `error` when an error stack is attached. The console pipeline
 * passes false because it has already resolved the level, and a `{ level }` override must win.
 */
export function buildFormattedLogObject(object: any, envConfig: LoggerEnvironmentConfig, sourceIsError: boolean = true, forceErrorLevel: boolean = true): any {
  let formattedObject: any = object;

  formattedObject = preserveMessageObject(formattedObject);
  formattedObject = mergeExtraContext(formattedObject);
  if (sourceIsError) {
    formattedObject = attachFormattedStack(object, formattedObject, forceErrorLevel);
  }
  formattedObject = promoteMessageField(formattedObject);
  formattedObject = promoteLevelField(formattedObject);
  formattedObject = appendTimestamp(formattedObject, envConfig);
  formattedObject = trimLeadingMessageSeparator(formattedObject);
  formattedObject = autoParseMessageJson(formattedObject, envConfig);
  formattedObject = ensureMessagePlaceholder(formattedObject);

  return formattedObject;
}

export function formatErrorObject(object: any, envConfig: LoggerEnvironmentConfig): string {
  return formatLogObjectForOutput(buildFormattedLogObject(object, envConfig), envConfig);
}

export function formatLogObjectForOutput(logObject: any, envConfig: LoggerEnvironmentConfig, jsonString?: string): string {
  // No trailing newline: writeOutput() ends each entry with exactly one.
  if (envConfig.colorize) {
    return colorJson(logObject);
  }
  return jsonString != null ? jsonString : jsonStringifySafe(logObject);
}

function preserveMessageObject(formattedObject: any): any {
  if (typeof formattedObject.message !== 'object') {
    return formattedObject;
  }

  const messageObject = formattedObject.message;
  delete formattedObject.message;

  const clonedMessageObject = safeObjectAssign({}, [], messageObject);
  if (formattedObject['@messageObject'] == null) {
    formattedObject['@messageObject'] = clonedMessageObject;
  } else {
    formattedObject['@messageObject'] = safeObjectAssign(formattedObject['@messageObject'], [], clonedMessageObject);
  }

  return formattedObject;
}

function mergeExtraContext(formattedObject: any): any {
  if (!formattedObject.extraContext) {
    return formattedObject;
  }

  const extraContext = formattedObject.extraContext;
  delete formattedObject.extraContext;
  return safeObjectAssign(formattedObject, ['message'], extraContext);
}

function attachFormattedStack(sourceObject: any, formattedObject: any, forceErrorLevel: boolean): any {
  if (!sourceObject.stack) {
    return formattedObject;
  }

  const stack = sourceObject.stack;
  const formattedStack = FormatStackTrace.toNewLines(ToOneLine(stack));
  delete formattedObject.stack;
  delete formattedObject.errCallStack;

  formattedObject = safeObjectAssign(formattedObject, ['message'], { errCallStack: formattedStack });
  if (forceErrorLevel) {
    formattedObject.level = 'error';
  }

  if (formattedObject.message) {
    const stackRegexMatch = formattedStack.match(getStackMessageRegex());
    if (stackRegexMatch != null && stackRegexMatch.length >= 2) {
      const stackMessage = stackRegexMatch[1];
      const messageWithoutStackMessage = ToOneLine(formattedObject.message).replace(stackMessage, '').replace(/\s+$/, '');
      formattedObject.message = `${messageWithoutStackMessage} - ${stackMessage}`;
    }
    formattedObject.message = ToOneLine(formattedObject.message);
  }

  return formattedObject;
}

function promoteMessageField(formattedObject: any): any {
  if (!formattedObject.message) {
    return formattedObject;
  }

  const message = formattedObject.message;
  delete formattedObject.message;
  return { message, ...formattedObject };
}

function promoteLevelField(formattedObject: any): any {
  if (!formattedObject.level) {
    return formattedObject;
  }

  const savedLogLevel = formattedObject.level;
  delete formattedObject.level;
  return { level: savedLogLevel, ...formattedObject };
}

function appendTimestamp(formattedObject: any, envConfig: LoggerEnvironmentConfig): any {
  if (!envConfig.noTimeStamp) {
    formattedObject['@timestamp'] = new Date().toISOString();
  }
  return formattedObject;
}

function trimLeadingMessageSeparator(formattedObject: any): any {
  if (typeof formattedObject.message === 'string' && formattedObject.message.startsWith(' - ')) {
    formattedObject.message = formattedObject.message.substring(3);
  }

  return formattedObject;
}

function autoParseMessageJson(formattedObject: any, envConfig: LoggerEnvironmentConfig): any {
  if (typeof formattedObject.message !== 'string' || formattedObject.message.length === 0) {
    return formattedObject;
  }

  const parsedMessage = tryParseMessageJson(formattedObject.message, envConfig.disableAutoParse);
  if (parsedMessage == null) {
    return formattedObject;
  }

  if (envConfig.disableAutoParse) {
    formattedObject.message = parsedMessage;
  } else {
    formattedObject.message = AUTO_PARSED_JSON_MESSAGE;
    formattedObject['@autoParsedJson'] = parsedMessage;
  }

  return formattedObject;
}

function ensureMessagePlaceholder(formattedObject: any): any {
  const message = formattedObject.message;
  const isMissing = message == null || (typeof message === 'string' && message.length === 0);
  if (!isMissing) {
    return formattedObject;
  }

  // Every entry has a message: an empty or missing one (e.g. `new Error('')`) gets a placeholder,
  // placed right after `level` like a real message.
  const placeholder = formattedObject.level === 'error' ? EMPTY_ERROR_MESSAGE : EMPTY_MESSAGE;
  const { level, message: _dropped, ...rest } = formattedObject;
  return level !== undefined ? { level, message: placeholder, ...rest } : { message: placeholder, ...rest };
}

function tryParseMessageJson(message: string, disableAutoParse: boolean): any {
  const trimmedMessage = message.trim();
  if (!looksLikeJsonValue(trimmedMessage)) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(message);
    // Leave numbers that don't survive the round trip as the original text: auto-parsing
    // "12345678901234567890" would log 12345678901234567000, silently changing the value.
    if (typeof parsedValue === 'number' && String(parsedValue) !== trimmedMessage) {
      return null;
    }
    return disableAutoParse ? JSON.stringify(parsedValue) : parsedValue;
  } catch (_) {
    return null;
  }
}

function looksLikeJsonValue(trimmedMessage: string): boolean {
  const firstChar = trimmedMessage.charAt(0);
  return (
    firstChar === '{' ||
    firstChar === '[' ||
    firstChar === '"' ||
    firstChar === '-' ||
    (firstChar >= '0' && firstChar <= '9') ||
    trimmedMessage === 'true' ||
    trimmedMessage === 'false' ||
    trimmedMessage === 'null'
  );
}

function getStackMessageRegex(): RegExp {
  const separator = NewLineCharacter();
  if (stackMessageRegexCache == null || stackMessageRegexCache.separator !== separator) {
    stackMessageRegexCache = {
      separator,
      // The first line of any stack: "Error: msg", "TypeError: msg", "Error [ERR_X]: msg", ...
      regex: new RegExp(`^[^:\\n]*?:[ ](.*?)${escapeRegExp(separator)}`, 'i'),
    };
  }
  return stackMessageRegexCache.regex;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
