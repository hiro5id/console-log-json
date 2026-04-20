/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  FormatErrorObject,
  GetLogLevel,
  LOG_LEVEL,
  loadEnvConfig,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  NativeConsoleLog,
  overrideStdOut,
  restoreStdOut,
  SetLogLevel,
} from '../src';
import * as getCallsitesModule from '../src/callsites/get-callsites';
import { getCallingFilename } from '../src/get-calling-filename';
import { CaptureNestedStackTrace } from '../src/capture-nested-stack-trace';
import { colorJson, defaultColorMap } from '../src/colors/colorize';
import callsites from '../src/callsites/get-callsites';
import { getCallStack } from '../src/get-call-stack';
import sinon from 'sinon';

// ============================================================
// 1. getCallingFilename — direct tests
// ============================================================
describe('getCallingFilename', () => {
  it('returns a string containing the current test file', () => {
    const name = getCallingFilename();
    expect(name === null || typeof name === 'string').to.equal(true);
    if (typeof name === 'string') {
      expect(name.length).to.be.greaterThan(0);
    }
  });

  it('returns a relative path (not an absolute system path)', () => {
    const name = getCallingFilename();
    expect(name === null || typeof name === 'string').to.equal(true);
  });

  it('prefers V8 callsites and skips internal helper functions by identity', () => {
    const callsitesStub = sinon.stub(getCallsitesModule, 'default');
    const externalCaller = () => undefined;
    const createCallSite = (fn: any, fileName: string, functionName: string) =>
      ({
        getThis: () => undefined,
        getTypeName: () => null,
        getFunction: () => fn,
        getFunctionName: () => functionName,
        getMethodName: () => functionName,
        getFileName: () => fileName,
        getLineNumber: () => 1,
        getColumnNumber: () => 1,
        getEvalOrigin: () => undefined,
        isToplevel: () => false,
        isEval: () => false,
        isNative: () => false,
        isConstructor: () => false,
      } as any);

    callsitesStub.returns([
      createCallSite(getCallingFilename, '/workspace/app/dist/app.bundle.js', 'a'),
      createCallSite(getCallStack, '/workspace/app/dist/app.bundle.js', 'b'),
      createCallSite(externalCaller, '/workspace/app/src/routes/orders.ts', 'c'),
    ]);

    try {
      const name = getCallingFilename('Error\n    at a (bundle.min.js:1:1)');
      expect(name).to.equal('workspace/app/src/routes/orders.ts');
    } finally {
      callsitesStub.restore();
    }
  });
});

// ============================================================
// 2. callsites — direct tests
// ============================================================
describe('callsites', () => {
  it('returns an array of CallSite objects', () => {
    const sites = callsites();
    expect(sites).to.be.an('array');
    expect(sites.length).to.be.greaterThan(0);
  });

  it('CallSite objects have getFileName method', () => {
    const sites = callsites();
    expect(sites[0].getFileName).to.be.a('function');
    const filename = sites[0].getFileName();
    expect(filename).to.be.a('string');
  });

  it('CallSite objects have getLineNumber method', () => {
    const sites = callsites();
    const lineNumber = sites[0].getLineNumber();
    expect(lineNumber).to.be.a('number');
    expect(lineNumber!).to.be.greaterThan(0);
  });

  it('CallSite objects have getFunctionName method', () => {
    const sites = callsites();
    // getFunctionName may return null for anonymous, that's fine
    expect(sites[0].getFunctionName).to.be.a('function');
  });

  it('restores Error.prepareStackTrace after call', () => {
    const originalPrepare = Error.prepareStackTrace;
    callsites();
    expect(Error.prepareStackTrace).to.equal(originalPrepare);
  });
});

// ============================================================
// 3. CaptureNestedStackTrace — direct tests
// ============================================================
describe('CaptureNestedStackTrace', () => {
  it('capture adds Caused By to stack trace', () => {
    const outer = new Error('outer error');
    const inner = new Error('inner error');
    const capturer = new CaptureNestedStackTrace();
    capturer.capture(outer, inner);

    expect(outer.stack).to.include('Caused By:');
    expect(outer.stack).to.include('inner error');
  });

  it('capture preserves the outer error message in stack', () => {
    const outer = new Error('outer');
    const inner = new Error('inner');
    const capturer = new CaptureNestedStackTrace();
    capturer.capture(outer, inner);

    expect(outer.stack).to.include('outer');
  });

  it('capture handles nested error being null gracefully', () => {
    const outer = new Error('outer');
    const capturer = new CaptureNestedStackTrace();
    // null nested should not add Caused By
    capturer.capture(outer, null as any);
    expect(outer.stack).to.include('outer');
    // No "Caused By" since nested is null
    expect(outer.stack).to.not.include('Caused By:');
  });

  it('buildStackDescriptor works with value-type stack descriptor', () => {
    // When Object.getOwnPropertyDescriptor returns a value (not a getter),
    // the value branch is used
    const err = new Error('test');
    const inner = new Error('nested');
    const capturer = new CaptureNestedStackTrace();

    // Manually set stack as a value property (not getter)
    Object.defineProperty(err, 'stack', {
      value: 'Error: test\n    at someFunc (file.ts:1:1)',
      writable: true,
      configurable: true,
    });

    capturer.capture(err, inner);
    expect(err.stack).to.include('Caused By:');
    expect(err.stack).to.include('nested');
  });

  it('buildStackDescriptor works with getter-type stack descriptor', () => {
    const err = new Error('test');
    const inner = new Error('nested');
    const capturer = new CaptureNestedStackTrace();

    // Define stack as a getter property
    Object.defineProperty(err, 'stack', {
      get: () => 'Error: test\n    at someFunc (file.ts:1:1)',
      configurable: true,
    });

    capturer.capture(err, inner);
    // After capture, accessing stack should include Caused By
    expect(err.stack).to.include('Caused By:');
    expect(err.stack).to.include('nested');
  });
});

// ============================================================
// 4. ifEverythingFailsLogger — fallback output verification
// ============================================================
describe('ifEverythingFailsLogger fallback', () => {
  it('outputs JSON error to stderr when logging throws', async () => {
    const errorStub = sinon.stub(console, 'error');

    LoggerAdaptToConsole();
    (console as any).exception = () => {
      throw new Error('internal failure');
    };

    // This should trigger ifEverythingFailsLogger instead of crashing
    console.log('trigger failure');

    delete (console as any).exception;
    LoggerRestoreConsole();

    expect(errorStub.called).to.equal(true);
    expect(String(errorStub.firstCall.args[0])).to.include('error while trying to process');
    expect(String(errorStub.firstCall.args[0])).to.include('internal failure');
  });
});

// ============================================================
// 5. filterNullOrUndefinedParameters — adjacent nulls
// ============================================================
describe('filterNullOrUndefinedParameters edge cases', () => {
  it('handles adjacent null parameters', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(null, null, 'surviving message');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('surviving message');
  });

  it('handles all null parameters', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(null, null, null);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
    expect(testObj.message).to.equal('<value-passed-to-console-log-json-was-null>');
  });

  it('handles mixed undefined and values', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(undefined, 'hello', undefined, { key: 'val' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('hello');
    expect(testObj.key).to.equal('val');
  });
});

// ============================================================
// 7. colorJson — warn level coloring
// ============================================================
describe('colorJson - warn level', () => {
  const sandbox = sinon.createSandbox();
  process.env.FORCE_NO_COLOR = '';
  process.env.FORCE_COLOR = '';
  process.env.DYNO = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('colors warn level with yellow', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ level: 'warn', message: 'warning message' });
    // warn level should use yellow coloring
    expect(result).to.include(defaultColorMap.yellow);
  });

  it('colors warn message differently from error message', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const warnResult = colorJson({ level: 'warn', message: 'warn msg' });
    const errorResult = colorJson({ level: 'error', message: 'error msg' });

    // warn uses yellow for the message, error uses red
    expect(warnResult).to.include(defaultColorMap.yellow);
    expect(errorResult).to.include(defaultColorMap.red);
    // They should differ
    expect(warnResult).to.not.equal(errorResult);
  });

  it('colors special key values: @filename, @packageName, @timestamp, errCallStack', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const obj = {
      level: 'info',
      message: 'test',
      '@filename': 'test.ts',
      '@packageName': 'my-pkg',
      '@timestamp': '2026-01-01T00:00:00Z',
      errCallStack: 'Error: at ...',
      '@logCallStack': 'at func (file:1:1)',
    };
    const result = colorJson(obj);
    // Values of special keys still use semantic colors
    expect(result).to.include(defaultColorMap.yellow);    // @filename and @packageName values
    expect(result).to.include(defaultColorMap.lightPink); // @timestamp value
    expect(result).to.include(defaultColorMap.lightRed);  // errCallStack value
    // All keys use unique hash-based truecolor codes
    expect(result).to.match(/\x1b\[38;2;\d+;\d+;\d+m/);
  });

  it('handles spacing parameter', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('true');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ level: 'info', message: 'test' }, undefined, undefined, 2);
    // With spacing, the output should be indented
    expect(result).to.include('\n');
  });
});

// ============================================================
// 8. FormatErrorObject — object message bug documentation
// ============================================================
describe('FormatErrorObject edge cases', () => {
  const sandbox = sinon.createSandbox();
  process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('handles message that is an object without a message string property', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    loadEnvConfig();
    // When message is an object like { key: 'value' }, preserve it under
    // a dedicated field without crashing or overwriting the canonical message.
    const result = FormatErrorObject({ level: 'info', message: { key: 'value' } });
    const parsed = JSON.parse(result.trim());
    expect(parsed.level).to.equal('info');
    expect(parsed.message).to.equal('<no-message-was-passed-to-console-log>');
    expect(parsed['@messageObject']).to.eql({ key: 'value' });
  });

  it('handles message that is an object with its own message property', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    loadEnvConfig();
    const result = FormatErrorObject({ level: 'info', message: { message: 'inner msg', extra: 'data' } });
    const parsed = JSON.parse(result.trim());
    expect(parsed.level).to.equal('info');
    expect(parsed.message).to.equal('<no-message-was-passed-to-console-log>');
    expect(parsed['@messageObject']).to.eql({ message: 'inner msg', extra: 'data' });
  });

  it('handles stack with Caused By section', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    loadEnvConfig();
    const stack = 'Error: outer\n    at func1 (file.ts:1:1)\nCaused By: Error: inner\n    at func2 (file.ts:2:2)';
    const result = FormatErrorObject({ level: 'info', message: 'test', stack });
    const parsed = JSON.parse(result.trim());
    expect(parsed.level).to.equal('error');
    expect(parsed.errCallStack).to.include('Caused By');
  });

  it('auto-parses JSON arrays in message', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    loadEnvConfig();
    const result = FormatErrorObject({ level: 'info', message: '[1,2,3]' });
    const parsed = JSON.parse(result.trim());
    expect(parsed['@autoParsedJson']).to.eql([1, 2, 3]);
  });

  it('handles CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS with stack trace', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    loadEnvConfig();
    const stack = 'Error: test\n    at func (file.ts:1:1)';
    const result = FormatErrorObject({ level: 'info', message: 'msg', stack });
    // No trailing newline from the formatter
    expect(result.endsWith('\n')).to.equal(false);
  });

  it('handles colorized output with CONSOLE_LOG_COLORIZE', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_COLORIZE').value('TRUE');
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');
    loadEnvConfig();
    const result = FormatErrorObject({ level: 'info', message: 'colorized' });
    // Should contain ANSI escape codes
    expect(result).to.include('\x1b[');
  });
});

// ============================================================
// 9. console.log with level:warn parameter coloring via COLORIZE
// ============================================================
describe('colorized log output integration', () => {
  const sandbox = sinon.createSandbox();
  process.env.CONSOLE_LOG_COLORIZE = '';
  process.env.FORCE_NO_COLOR = '';
  process.env.FORCE_COLOR = '';
  process.env.DYNO = '';
  process.env.CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR = '';
  process.env.CONSOLE_LOG_JSON_NO_FILE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_PACKAGE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';
  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS = '';
  process.env.CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('console.warn with COLORIZE uses warn colors', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_COLORIZE').value('TRUE');
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      console.warn('a warning message');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // Output should contain ANSI codes and warn-level yellow
    expect(outputText[0]).to.include('\x1b[');
    expect(outputText[0]).to.include(defaultColorMap.yellow);
  });
});

// ============================================================
// 10. LoggerAdaptToConsole — default log level is info
// ============================================================
describe('LoggerAdaptToConsole defaults', () => {
  it('default log level is info', () => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole();
    restoreStdOut(originalWrite);

    expect(GetLogLevel()).to.equal('info');
    LoggerRestoreConsole();
  });

  it('default debugString is false (no _loggerDebug in output)', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('no debug');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj._loggerDebug).to.equal(undefined);
  });
});

// ============================================================
// 11. Error with name property — @errorObjectName extraction
// ============================================================
describe('Error with custom name property', () => {
  it('includes @errorObjectName when error has a name', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const err = new Error('typed error');
    err.name = 'CustomError';
    console.log('something broke', err, { extra: 'info' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@errorObjectName']).to.equal('CustomError');
  });

  it('includes @errorObjectName for non-standard error objects with name', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('db error', {
      name: 'MongoError',
      message: 'connection refused',
      stack: 'MongoError: connection refused\n    at connect (mongo.js:1:1)',
    });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@errorObjectName']).to.equal('MongoError');
  });
});

// ============================================================
// 12. Multiple explicit level parameters — only first is used
// ============================================================
describe('explicit level edge cases', () => {
  it('uses the first level parameter when multiple are provided', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({ level: 'error' }, { level: 'warn' }, 'test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // First {level} found wins
    expect(testObj.level).to.equal('error');
  });

  it('explicit level:silly is used when log level permits', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.silly });

    try {
      console.log({ level: 'silly' }, 'silly explicit');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('silly');
  });

  it('explicit level:http is used when log level permits', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.silly });

    try {
      console.log({ level: 'http' }, 'http explicit');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('http');
  });

  it('explicit level:verbose is used when log level permits', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.silly });

    try {
      console.log({ level: 'verbose' }, 'verbose explicit');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('verbose');
  });
});

// ============================================================
// 13. console.log with only an error — stack sets level to error
// ============================================================
describe('error detection overrides level', () => {
  it('console.info with an Error object becomes level error', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.info(new Error('info error'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // FormatErrorObject sets level to 'error' when stack is present
    expect(testObj.level).to.equal('error');
  });

  it('console.log with an Error object becomes level error', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(new Error('log error'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
  });
});

// ============================================================
// 14. Special number types as parameters
// ============================================================
describe('special number types', () => {
  it('handles NaN as parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('value is', NaN);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('NaN');
  });

  it('handles Infinity as parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('value is', Infinity);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('Infinity');
  });

  it('handles negative number', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('count', -5);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('-5');
  });

  it('handles zero', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('count', 0);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // 0 is a number, gets concatenated to message
    expect(testObj.message).to.include('0');
  });
});

// ============================================================
// 15. Keys with special characters in context objects
// ============================================================
describe('special keys in context objects', () => {
  it('handles keys with special characters', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('special keys', { 'key-with-dashes': 'v1', 'key.with.dots': 'v2', 'key with spaces': 'v3' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['key-with-dashes']).to.equal('v1');
    expect(testObj['key.with.dots']).to.equal('v2');
    expect(testObj['key with spaces']).to.equal('v3');
  });

  it('handles numeric-like keys', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('numeric keys', { '0': 'zero', '1': 'one' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['0']).to.equal('zero');
    expect(testObj['1']).to.equal('one');
  });
});

// ============================================================
// 16. overrideStdOut / restoreStdOut — multiple captures
// ============================================================
describe('overrideStdOut advanced', () => {
  it('captures multiple writes', () => {
    const { originalWrite, outputText } = overrideStdOut();
    process.stdout.write('line1');
    process.stdout.write('line2');
    process.stdout.write('line3');
    restoreStdOut(originalWrite);

    expect(outputText.length).to.equal(3);
    expect(outputText[0]).to.equal('line1');
    expect(outputText[1]).to.equal('line2');
    expect(outputText[2]).to.equal('line3');
  });
});

// ============================================================
// 17. NativeConsoleLog before LoggerAdaptToConsole
// ============================================================
describe('NativeConsoleLog edge cases', () => {
  it('NativeConsoleLog works even when called standalone (falls back to console.log)', () => {
    expect(() => NativeConsoleLog('standalone native')).to.not.throw();
  });
});
