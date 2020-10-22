/* tslint:disable:object-literal-sort-keys */
import appRootPath from 'app-root-path';
import stringify from 'json-stringify-safe';
import * as path from 'path';
import * as w from 'winston';
import { ErrorWithContext } from './error-with-context';
import { FormatStackTrace } from './format-stack-trace';
import { getCallStack } from './get-call-stack';
import { getCallingFilename } from './get-calling-filename';
import { safeObjectAssign } from './safe-object-assign';
import { sortObject } from './sort-object';
import { ToOneLine } from './to-one-line';

// tslint:disable-next-line:no-var-requires
require('source-map-support').install({
  hookRequire: true,
});

// tslint:disable-next-line:no-var-requires
/* tslint:disable:no-conditional-assignment */

// Console-polyfill. MIT license.
// https://github.com/paulmillr/console-polyfill
// Make it safe to do console.log() always.
((global) => {
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
  // Using `this` for web workers & supports Browserify / Webpack.
})(typeof window === 'undefined' ? this : window);

declare global {
  // tslint:disable-next-line:interface-name
  interface Console {
    Console: NodeJS.ConsoleConstructor;

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

export function FormatErrorObject(object: any) {
  let returnData: any = object;

  // Flatten message if it is an object
  if (typeof object.message === 'object') {
    // const messageObj = object.message;
    // delete returnData.message;
    returnData = safeObjectAssign(returnData, ['message'], object.message);
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
      const stackRegex = /^Error:[ ](.*?)\n/im;
      const stackRegexMatch = stackOneLine.match(stackRegex);
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
  const { CONSOLE_LOG_JSON_NO_TIME_STAMP } = process.env;
  if (CONSOLE_LOG_JSON_NO_TIME_STAMP?.toLowerCase() !== 'true') {
    returnData['@timestamp'] = new Date().toISOString();
  }

  // cleanup leading dash in message
  if (returnData.message && returnData.message.startsWith(' - ')) {
    returnData.message = returnData.message.substring(3);
  }

  // interpret JSON if it is inside the error message
  if (returnData.message && returnData.message.length > 0) {
    let parsedObject = null;
    try {
      parsedObject = JSON.parse(returnData.message);
    } catch (err) {
      // do nothing
    }
    if (parsedObject != null) {
      returnData.message = '<auto-parsed-json-string-see-@autoParsedJson-property>';
      returnData['@autoParsedJson'] = parsedObject;
    }
  }

  if (returnData.message != null && returnData.message.length === 0) {
    if (returnData.level === 'error') {
      returnData.message = '<no-error-message-was-passed-to-console-log>';
    } else {
      returnData.message = '<no-message-was-passed-to-console-log>';
    }
  }

  const jsonString = stringify(returnData);

  // strip ansi colors
  const colorStripped = jsonString.replace(/\\u001B\[\d*m/gim, '');

  // add new line at the end for better local readability
  return `${colorStripped}\n`;
}

const print = w.format.printf((info: any) => {
  return FormatErrorObject(info);
});

const Logger = w.createLogger({
  level: 'info',
  format: w.format.combine(w.format.errors({ stack: true }), print),
  transports: [new w.transports.Console()],
});

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

export function NativeConsoleLog(...args: any[]) {
  if (consoleLogBackup) {
    consoleLogBackup(...args);
  } else {
    console.log(...args);
  }
}

function ifEverythingFailsLogger(functionName: string, err: Error) {
  if (consoleErrorBackup != null) {
    try {
      consoleErrorBackup(`{"level":"error","message":"Error: console-log-json: error while trying to process ${functionName} : ${err.message}"}`);
    } catch (err) {
      throw new Error(`Failed to call ${functionName} and failed to fall back to native function`);
    }
  } else {
    throw new Error('Error: console-log-json: This is unexpected, there is no where to call console.log, this should never happen');
  }
}

let logParams!: { logLevel: LOG_LEVEL; debugString: boolean };

export function LoggerAdaptToConsole(options?: { logLevel?: LOG_LEVEL; debugString?: boolean }) {
  const defaultOptions = {
    logLevel: LOG_LEVEL.info,
    debugString: false,
  };
  logParams = { ...defaultOptions, ...options };

  // log package name
  packageName = '';
  const jsonPackage = require(path.join(appRootPath.toString(), 'package.json'));
  packageName = jsonPackage.name;

  Logger.level = logParams.logLevel;

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
    return logUsingWinston(args, LOG_LEVEL.error);
  };

  console.warn = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.warn);
  };

  console.info = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.info);
  };

  console.http = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.http);
  };

  console.verbose = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.verbose);
  };

  console.debug = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.debug);
  };

  console.silly = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.silly);
  };

  console.log = (...args: any[]) => {
    return logUsingWinston(args, LOG_LEVEL.info);
  };
}

function filterNullOrUndefinedParameters(args: any[]): number {
  let nullOrUndefinedCount = 0;
  args.forEach((f: any, index: number) => {
    // Remove null parameters
    if (f == null) {
      nullOrUndefinedCount += 1;
      args.splice(index, 1);
      return;
    }
  });

  return nullOrUndefinedCount;
}

function findExplicitLogLevelAndUseIt(args: any[], level: LOG_LEVEL) {
  let foundLevel = false;
  args.forEach((f: any) => {
    if (!foundLevel && f && typeof f === 'object' && Object.keys(f) && Object.keys(f).length > 0 && Object.keys(f)[0].toLowerCase() === 'level') {
      let specifiedLevelFromParameters: string = f[Object.keys(f)[0]];

      // Normalize alternate log level strings
      if (specifiedLevelFromParameters.toLowerCase() === 'err') {
        specifiedLevelFromParameters = LOG_LEVEL.error;
      }
      if (specifiedLevelFromParameters.toLowerCase() === 'warning') {
        specifiedLevelFromParameters = LOG_LEVEL.warn;
      }
      if (specifiedLevelFromParameters.toLowerCase() === 'information') {
        specifiedLevelFromParameters = LOG_LEVEL.info;
      }

      const maybeLevel: LOG_LEVEL | undefined = (LOG_LEVEL as any)[specifiedLevelFromParameters];
      if (maybeLevel !== undefined) {
        level = maybeLevel;
      } else {
        level = LOG_LEVEL.info;
      }

      // Remove this property since we have absorbed it into the log level
      delete f[Object.keys(f)[0]];
      foundLevel = true;
    }
  });
  return level;
}

let packageName: string = '';

export function logUsingWinston(args: any[], level: LOG_LEVEL) {
  if (packageName.length === 0) {
    args.push({ '@packageName': '<not-yet-set> Please await the call LoggerAdaptToConsole() on startup' });
  } else {
    args.push({ '@packageName': packageName });
  }

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
  } catch (err) {
    args.push({ _loggerDebug: `err ${err.message}` });
  }

  // Discover calling filename
  try {
    const name = getCallingFilename();
    if (name) {
      args.push({ '@filename': name, '@logCallStack': getCallStack() });
    } else {
      args.push({ '@filename': '<unknown>', '@logCallStack': getCallStack() });
    }
  } catch (err) {
    args.push({ '@filename': `<error>:${err.message}`, '@logCallStack': err.message });
  }

  try {
    level = findExplicitLogLevelAndUseIt(args, level);

    // this line is only for enabling testing
    if (console.exception != null) {
      console.exception();
    }
    const { message, errorObject } = extractParametersFromArguments(args);

    Logger.log(level, message, supressDetailsIfSelected(errorObject));
  } catch (err) {
    ifEverythingFailsLogger('console.log', err);
  }
}

function supressDetailsIfSelected(errorObject: ErrorWithContext | undefined) {
  const { CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR } = process.env;
  const { CONSOLE_LOG_JSON_NO_FILE_NAME } = process.env;
  const { CONSOLE_LOG_JSON_NO_PACKAGE_NAME } = process.env;

  if (errorObject == undefined) {
    return undefined;
  }

  if (CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR?.toLowerCase() === 'true') {
    delete (errorObject as any)['@logCallStack'];
  }

  if (CONSOLE_LOG_JSON_NO_FILE_NAME?.toLowerCase() === 'true') {
    delete (errorObject as any)['@filename'];
  }

  if (CONSOLE_LOG_JSON_NO_PACKAGE_NAME?.toLowerCase() === 'true') {
    delete (errorObject as any)['@packageName'];
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
    // String parameter or number parameter
    if (typeof f === 'string' || typeof f === 'number') {
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
  if (extraContext != undefined) {
    // noinspection JSUnusedAssignment
    extraContext = sortObject(extraContext);
    if (errorObject == undefined) {
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
  const originalWrite = process.stdout.write;
  const outputText: string[] = [];
  (process.stdout.write as any) = (...text: string[]): void => {
    outputText.push(text[0]);
  };
  return { originalWrite, outputText };
}

export function restoreStdOut(originalWrite: any) {
  (process.stdout.write as any) = originalWrite;
}
