/* tslint:disable:object-literal-sort-keys */
import appRootPath from 'app-root-path';
import callsites from 'callsites';
import * as w from 'winston';
import { ErrorWithContext } from './error-with-context';
import { ToOneLine } from './to-one-line';
// tslint:disable-next-line:no-var-requires

/* tslint:disable:no-conditional-assignment */
// Console-polyfill. MIT license.
// https://github.com/paulmillr/console-polyfill
// Make it safe to do console.log() always.
(global => {
  'use strict';
  if (!global.console) {
    // @ts-ignore
    global.console = {} as any;
  }
  const con = global.console;
  let prop;
  let method;
  // tslint:disable-next-line:no-empty only-arrow-functions
  const dummy = function() {};
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
  // const stack = {level: 'error', stack: ToOneLine(info.stack)};
  let returnData: any = object;

  // Flatten message if it is an object
  if (typeof object.message === 'object') {
    const messageObj = object.message;
    delete returnData.message;
    returnData = Object.assign(returnData, messageObj);
  }

  // Combine extra context from ErrorWithContext
  if (object.extraContext) {
    const extraContext = object.extraContext;
    delete returnData.extraContext;
    returnData = Object.assign(returnData, extraContext);
  }

  // Add stack trace if available
  if (object.stack) {
    const stack = object.stack;
    const stackOneLine = ToOneLine(stack);
    delete returnData.stack;
    returnData = Object.assign(returnData, { stack: stackOneLine });
    returnData.level = 'error';

    // Lets put a space into the message when stack message exists
    if (returnData.message) {
      const stackRegex = /^Error:[ ](.*?)([ ]{4})(at )/im;
      const stackRegexMatch = stackOneLine.match(stackRegex);
      if (stackRegexMatch != null && stackRegexMatch.length >= 4) {
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
  returnData['@timestamp'] = new Date().toISOString();

  const jsonString = JSON.stringify(returnData);

  // strip ansi colors
  return jsonString.replace(/\\u001B\[\d*m/gim, '');
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
      consoleErrorBackup(`Error: console-log-json: error while trying to process ${functionName} : ${err.message}`);
    } catch (err) {
      throw new Error(`Failed to call ${functionName} and failed to fall back to native function`);
    }
  } else {
    throw new Error(
      'Error: console-log-json: This is unexpected, there is no where to call console.log, this should never happen',
    );
  }
}

export function LoggerAdaptToConsole(logLevel: LOG_LEVEL = LOG_LEVEL.info) {
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
    void logUsingWinston(args, LOG_LEVEL.error);
  };

  console.warn = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.warn);
  };

  console.info = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.info);
  };

  console.http = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.http);
  };

  console.verbose = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.verbose);
  };

  console.debug = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.debug);
  };

  console.silly = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.silly);
  };

  console.log = (...args: any[]) => {
    void logUsingWinston(args, LOG_LEVEL.info);
  };

  Logger.level = logLevel;
}

function filterNullParameters(args: any) {
  args.forEach((f: any, index: number) => {
    // Remove null parameters
    if (f == null) {
      args.splice(index, 1);
      return;
    }
  });
}

function findExplicitLogLevelAndUseIt(args: any, level: LOG_LEVEL) {
  let foundLevel = false;
  args.forEach((f: any) => {
    if (
      !foundLevel &&
      typeof f === 'object' &&
      Object.keys(f) &&
      Object.keys(f).length > 0 &&
      Object.keys(f)[0].toLowerCase() === 'level'
    ) {
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

export async function logUsingWinston(args: any, level: LOG_LEVEL) {
  try {
    const callsite = callsites()[2];
    let name = callsite.getFileName();
    if (name) {
      name = name.replace(appRootPath.toString(), '');
    }
    args.push({ filename: name });
  } catch (err) {
    // Don't do anything
  }

  const logPromise = new Promise(resolve => {
    try {
      filterNullParameters(args);
      level = findExplicitLogLevelAndUseIt(args, level);

      // this line is only for enabling testing
      if (console.exception != null) {
        console.exception();
      }
      const { message, errorObject } = extractParametersFromArguments(args);
      Logger.log(level, message, errorObject);
    } catch (err) {
      ifEverythingFailsLogger('console.log', err);
    }
    resolve();
  });
  await logPromise;
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

function extractParametersFromArguments(args: any) {
  let message = '';
  let errorObject: ErrorWithContext | undefined;
  let extraContext: object | undefined;

  args.forEach((f: any) => {
    // String parameter or number parameter
    if (typeof f === 'string' || typeof f === 'number') {
      message = `${message}${message.length > 0 ? ' - ' : ''}${f}`;
    }
    // Error Object parameter
    else if (
      typeof f === 'object' &&
      f.name === 'Error' &&
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
        extraContext = { ...extraContext, ...f };
      }
    }
  });

  // if we have extra context we must either wrap it into an existing error object or, pass it dry
  if (extraContext != undefined) {
    // noinspection JSUnusedAssignment
    extraContext = sortObject(extraContext);
    if (errorObject === undefined) {
      // noinspection JSUnusedAssignment
      errorObject = extraContext as any;
    } else {
      // noinspection JSUnusedAssignment
      errorObject = new ErrorWithContext(errorObject, extraContext);
    }
  }

  return { message, errorObject };
}

function sortObject(foo: any): object {
  const keys = Object.keys(foo);
  const objectArray: Array<{ key: string; val: object }> = [];
  keys.forEach((k: string) => {
    objectArray.push({ key: k, val: foo[k] });
  });

  const sorted = objectArray.sort((a, b) => {
    return a.key === b.key ? 0 : a.key < b.key ? -1 : 1;
  });

  const sortedObject: any = {};
  sorted.forEach(p => {
    sortedObject[p.key] = p.val;
  });
  return sortedObject;
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
