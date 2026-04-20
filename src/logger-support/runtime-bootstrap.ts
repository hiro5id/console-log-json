// Install source-map support when available.
// This remains optional so the library still works in browsers and minimal runtimes.
try {
  if (typeof require !== 'undefined') {
    require('source-map-support').install({ hookRequire: true }); // tslint:disable-line:no-var-requires
  }
} catch (_) {
  /* source-map-support not available */
}

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
  // tslint:disable-next-line:no-conditional-assignment
  while ((prop = properties.pop())) {
    if (!(con as any)[prop]) {
      (con as any)[prop] = {};
    }
  }
  // tslint:disable-next-line:no-conditional-assignment
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

export {};
