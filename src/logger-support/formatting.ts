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

export function buildFormattedLogObject(object: any, envConfig: LoggerEnvironmentConfig): any {
  let formattedObject: any = object;

  formattedObject = preserveMessageObject(formattedObject);
  formattedObject = mergeExtraContext(formattedObject);
  formattedObject = attachFormattedStack(object, formattedObject);
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
  if (envConfig.colorize) {
    return appendTrailingLogCharacter(colorJson(logObject), envConfig);
  }
  return appendTrailingLogCharacter(jsonString != null ? jsonString : jsonStringifySafe(logObject), envConfig);
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

function attachFormattedStack(sourceObject: any, formattedObject: any): any {
  if (!sourceObject.stack) {
    return formattedObject;
  }

  const stack = sourceObject.stack;
  const formattedStack = FormatStackTrace.toNewLines(ToOneLine(stack));
  delete formattedObject.stack;
  delete formattedObject.errCallStack;

  formattedObject = safeObjectAssign(formattedObject, ['message'], { errCallStack: formattedStack });
  formattedObject.level = 'error';

  if (formattedObject.message) {
    const stackRegexMatch = formattedStack.match(getStackMessageRegex());
    if (stackRegexMatch != null && stackRegexMatch.length >= 2) {
      const stackMessage = stackRegexMatch[1];
      formattedObject.message = `${ToOneLine(formattedObject.message).replace(stackMessage, '')} - ${stackMessage}`;
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
  if (formattedObject.message != null && typeof formattedObject.message === 'string' && formattedObject.message.length === 0) {
    formattedObject.message = formattedObject.level === 'error' ? EMPTY_ERROR_MESSAGE : EMPTY_MESSAGE;
  }

  if (formattedObject.message == null && formattedObject['@messageObject'] != null) {
    formattedObject.message = formattedObject.level === 'error' ? EMPTY_ERROR_MESSAGE : EMPTY_MESSAGE;
  }

  return formattedObject;
}

function appendTrailingLogCharacter(text: string, envConfig: LoggerEnvironmentConfig): string {
  let endOfLogCharacter = '\n';
  if (envConfig.noNewLineCharacters || envConfig.noNewLineCharactersExceptStack) {
    endOfLogCharacter = '';
  }
  return `${text}${endOfLogCharacter}`;
}

function tryParseMessageJson(message: string, disableAutoParse: boolean): any {
  const trimmedMessage = message.trim();
  if (!looksLikeJsonValue(trimmedMessage)) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(message);
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
      regex: new RegExp(`^Error:[ ](.*?)${separator}`, 'im'),
    };
  }
  return stackMessageRegexCache.regex;
}
