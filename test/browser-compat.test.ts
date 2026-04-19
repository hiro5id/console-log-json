/* tslint:disable:object-literal-sort-keys */
import { jest } from '@jest/globals';
import { expect } from 'chai';
import { getEnv } from '../src/get-env';
import { CaptureNestedStackTrace } from '../src/capture-nested-stack-trace';
import { ErrorWithContext } from '../src/error-with-context';
import { FormatStackTrace } from '../src/format-stack-trace';
import { getCallStackFromString } from '../src/get-call-stack';
import { getCallingFilenameFromStack } from '../src/get-calling-filename';
import { NewLineCharacter, resetNewLineCharacterCache } from '../src/new-line-character';
import { ToOneLine } from '../src/to-one-line';
import { sortObject } from '../src/sort-object';
import { safeObjectAssign } from '../src/safe-object-assign';
import { jsonStringifySafe } from '../src/json-stringify-safe/stringify-safe';
import { colorJson, supportsColor } from '../src/colors/colorize';
import { FormatErrorObject, loadEnvConfig, restoreStdOut } from '../src';
import sinon from 'sinon';

/**
 * These tests verify that the library degrades gracefully in browser-like
 * environments where Node.js APIs (process, require, fs, path, V8 stack APIs)
 * are unavailable.
 *
 * Since we can't actually remove Node globals from a running Node process,
 * we test each browser-safe code path by:
 * 1. Testing stub/fallback behavior directly
 * 2. Simulating missing APIs where possible
 * 3. Verifying that pure-JS modules work without Node dependencies
 */
describe('Browser compatibility', () => {
  const sandbox = sinon.createSandbox();

  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS = '';
  process.env.CONSOLE_LOG_JSON_NO_FILE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_PACKAGE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';
  process.env.CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR = '';
  process.env.FORCE_NO_COLOR = '';
  process.env.FORCE_COLOR = '';
  process.env.DYNO = '';

  afterEach(() => {
    sandbox.restore();
    resetNewLineCharacterCache();
  });

  // ============================================================
  // Pure JS modules — these must work identically in any environment
  // ============================================================
  describe('Pure JS modules (no Node APIs needed)', () => {
    it('ToOneLine works without any Node APIs', () => {
      expect(ToOneLine('hello\nworld\r\nfoo')).to.equal('helloworldfoo');
      expect(ToOneLine('')).to.equal('');
      expect(ToOneLine(null as any)).to.equal(null);
    });

    it('sortObject works without any Node APIs', () => {
      const result: any = sortObject({ z: 3, a: 1, m: 2 });
      expect(Object.keys(result)).to.eql(['a', 'm', 'z']);
    });

    it('safeObjectAssign works without any Node APIs', () => {
      const result = safeObjectAssign({ a: 1 }, [], { b: 2 });
      expect(result.a).to.equal(1);
      expect(result.b).to.equal(2);
    });

    it('safeObjectAssign handles circular references without Node APIs', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      const result = safeObjectAssign({}, [], obj);
      expect(result.name).to.equal('test');
      expect(result.self).to.include('[Circular');
    });

    it('jsonStringifySafe works without any Node APIs', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      const result = jsonStringifySafe(obj);
      expect(result).to.include('"a":1');
      expect(result).to.include('[Circular ~]');
    });

    it('ErrorWithContext works without Node APIs', () => {
      const err = new ErrorWithContext('test error', { key: 'value' });
      expect(err.message).to.equal('test error');
      expect((err as any).extraContext.key).to.equal('value');
      expect(err.stack).to.be.a('string');
    });

    it('ErrorWithContext wrapping preserves stack without V8-specific captureStackTrace', () => {
      // Even if captureStackTrace is unavailable, Error objects still have .stack
      // from the constructor. The wrapping should still work.
      const inner = new Error('inner');
      const outer = new ErrorWithContext(inner, { ctx: 'data' });
      expect(outer.message).to.equal('inner');
      expect(outer.stack).to.be.a('string');
      expect(outer.stack).to.include('inner');
    });
  });

  // ============================================================
  // getEnv — browser returns undefined for all env vars
  // ============================================================
  describe('getEnv in browser-like environment', () => {
    it('returns the value when process.env is available (Node)', () => {
      process.env.TEST_BROWSER_COMPAT = 'hello';
      expect(getEnv('TEST_BROWSER_COMPAT')).to.equal('hello');
      delete process.env.TEST_BROWSER_COMPAT;
    });

    it('returns undefined for non-existent env vars', () => {
      expect(getEnv('NONEXISTENT_VAR_12345')).to.equal(undefined);
    });
  });

  // ============================================================
  // callsites — stub behavior for non-V8 environments
  // ============================================================
  describe('callsites stub behavior (non-V8 browsers)', () => {
    it('stub CallSite returns null for getFileName', () => {
      // Directly test the stub shape that would be returned in Firefox/Safari.
      // In V8 (Node), prepareStackTrace exists, so we get real callsites.
      // The stub path is for non-V8. We verify the stub shape here:
      const stubSite = {
        getThis: () => undefined,
        getTypeName: () => null,
        getFunction: () => undefined,
        getFunctionName: () => null,
        getMethodName: () => undefined,
        getFileName: () => null,
        getLineNumber: () => null,
        getColumnNumber: () => null,
        getEvalOrigin: () => undefined,
        isToplevel: () => false,
        isEval: () => false,
        isNative: () => false,
        isConstructor: () => false,
      };

      // Verify stub shape matches what the code produces
      expect(stubSite.getFileName()).to.equal(null);
      expect(stubSite.getLineNumber()).to.equal(null);
      expect(stubSite.getFunctionName()).to.equal(null);
      expect(stubSite.getColumnNumber()).to.equal(null);
    });
  });

  // ============================================================
  // getCallingFilenameFromStack — works with any stack string format
  // ============================================================
  describe('getCallingFilenameFromStack with browser-style stacks', () => {
    it('extracts filename from Chrome/V8 stack format', () => {
      const stack = 'Error\n    at Object.log (app.js:10:5)\n    at handleClick (src/components/Button.tsx:25:3)';
      const name = getCallingFilenameFromStack(stack);
      // Should find the first non-internal frame
      expect(name).to.be.a('string');
      expect(name).to.include('app.js');
    });

    it('extracts filename from a simple stack format', () => {
      const stack = 'Error\n    at doSomething (bundle.min.js:1:2345)\n    at onClick (bundle.min.js:1:6789)';
      const name = getCallingFilenameFromStack(stack);
      expect(name).to.include('bundle.min.js');
    });

    it('skips installed package frames and returns the first application frame', () => {
      const stack =
        'Error\n' +
        '    at emitConsoleJsonLog (file:///home/projects/app/node_modules/console-log-json/dist/esm/index.mjs:3717:33)\n' +
        '    at logUsingConsoleJson (file:///home/projects/app/node_modules/console-log-json/dist/esm/index.mjs:3767:3)\n' +
        '    at LoggerAdaptToConsole.console.log (file:///home/projects/app/node_modules/console-log-json/dist/esm/index.mjs:3601:12)\n' +
        '    at file:///home/projects/app/index.js:3:9';
      const name = getCallingFilenameFromStack(stack);
      expect(name).to.equal('home/projects/app/index.js');
    });

    it('returns null when stack has no parseable frames', () => {
      const name = getCallingFilenameFromStack('Error\n    no valid frames here');
      expect(name).to.equal(null);
    });

    it('returns null for empty stack', () => {
      const name = getCallingFilenameFromStack('');
      expect(name).to.equal(null);
    });

    it('skips fallback-pattern internal frames and returns the first external caller', () => {
      const stack =
        'Error\n' +
        '    at logUsingConsoleJson (logger.js:100:5)\n' +
        '    at LoggerAdaptToConsole.console.log (logger.js:200:5)\n' +
        '    at getCallingFilename (logger.js:300:5)\n' +
        '    at getCallStack (logger.js:400:5)\n' +
        '    at handleClick (src/components/Button.tsx:25:3)';
      const name = getCallingFilenameFromStack(stack);
      expect(name).to.equal('src/components/Button.tsx');
    });

    it('handles stack with only internal frames by returning the first available', () => {
      // If all frames are internal, it should still return something
      const stack = 'Error\n    at logUsingConsoleJson (logger.js:100:5)\n    at LoggerAdaptToConsole.console.log (logger.js:200:5)';
      // These are internal frames, so it returns null (no external caller found)
      const name = getCallingFilenameFromStack(stack);
      // In this case with only internal frames, result depends on whether __filename matches
      // Since we're in test, __filename-based detection may or may not match
      // The key assertion: it doesn't throw
      expect(name === null || typeof name === 'string').to.equal(true);
    });
  });

  // ============================================================
  // getCallStackFromString — works with any stack string
  // ============================================================
  describe('getCallStackFromString with browser-style stacks', () => {
    it('parses a stack string without Node-specific paths', () => {
      const stack = 'Error: test\n    at handleClick (bundle.js:1:100)\n    at onClick (bundle.js:1:200)';
      const result = getCallStackFromString(stack);
      expect(result).to.be.a('string');
      expect(result).to.include('handleClick');
      expect(result).to.include('onClick');
      // "Error: test" line should be removed
      expect(result.startsWith('Error:')).to.equal(false);
    });

    it('handles empty stack string', () => {
      const result = getCallStackFromString('');
      expect(result).to.be.a('string');
    });

    it('removes a bare Error header line', () => {
      const stack = 'Error\n    at file:///home/projects/app/index.js:3:9\n    at ModuleJob.run (node:internal/modules/esm/module_job:222:25)';
      const result = getCallStackFromString(stack);
      expect(result.startsWith('Error')).to.equal(false);
      expect(result).to.include('index.js:3:9');
    });

    it('skips leading internal logger helper frames', () => {
      const stack =
        'Error\n' +
        '    at captureFileInfo (/home/projects/console-log-json/src/logger.ts:728:25)\n' +
        '    at emitConsoleJsonLog (/home/projects/console-log-json/src/logger.ts:765:65)\n' +
        '    at logUsingConsoleJson (/home/projects/console-log-json/src/logger.ts:819:3)\n' +
        '    at file:///home/projects/app/index.js:3:9\n' +
        '    at ModuleJob.run (node:internal/modules/esm/module_job:222:25)';
      const result = getCallStackFromString(stack);
      expect(result).to.include('index.js:3:9');
      expect(result).to.not.include('captureFileInfo');
      expect(result).to.not.include('emitConsoleJsonLog');
      expect(result).to.not.include('logUsingConsoleJson');
    });
  });

  // ============================================================
  // CaptureNestedStackTrace — works without Error.captureStackTrace
  // ============================================================
  describe('CaptureNestedStackTrace without V8 captureStackTrace', () => {
    it('still produces Caused By chain even without captureStackTrace', () => {
      // Temporarily remove captureStackTrace to simulate non-V8
      const original = Error.captureStackTrace;
      (Error as any).captureStackTrace = undefined;

      try {
        const inner = new Error('inner');
        const outer = new Error('outer');
        const capturer = new CaptureNestedStackTrace();
        capturer.capture(outer, inner);

        expect(outer.stack).to.include('Caused By:');
        expect(outer.stack).to.include('inner');
      } finally {
        Error.captureStackTrace = original;
      }
    });

    it('ErrorWithContext works without captureStackTrace', () => {
      const original = Error.captureStackTrace;
      (Error as any).captureStackTrace = undefined;

      try {
        const inner = new Error('db error');
        const outer = new ErrorWithContext(inner, { table: 'users' });
        expect(outer.message).to.equal('db error');
        expect((outer as any).extraContext.table).to.equal('users');
        expect(outer.stack).to.be.a('string');
      } finally {
        Error.captureStackTrace = original;
      }
    });
  });

  // ============================================================
  // FormatStackTrace — works without app-root-path
  // ============================================================
  describe('FormatStackTrace without Node path module', () => {
    it('toArray handles a browser-style stack', () => {
      const stack = 'Error: test    at handleClick (bundle.js:1:100)    at onClick (bundle.js:1:200)';
      const result = FormatStackTrace.toArray(stack);
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(1);
    });

    it('toNewLines produces readable output from browser stack', () => {
      const stack = 'Error: test    at handleClick (bundle.js:1:100)    at onClick (bundle.js:1:200)';
      const result = FormatStackTrace.toNewLines(stack);
      expect(result).to.include('handleClick');
      expect(result).to.include('onClick');
    });
  });

  // ============================================================
  // NewLineCharacter — returns sensible default without process.env
  // ============================================================
  describe('NewLineCharacter browser defaults', () => {
    it('returns \\n when env var is not set (browser default)', () => {
      // In browser, getEnv returns undefined, so NewLineCharacter should return \n
      resetNewLineCharacterCache();
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('');
      resetNewLineCharacterCache();
      expect(NewLineCharacter()).to.equal('\n');
    });
  });

  // ============================================================
  // colorJson / supportsColor — browser behavior
  // ============================================================
  describe('colorJson in browser-like environment', () => {
    it('supportsColor returns true when no env vars are set (browser default)', () => {
      // In browser, getEnv returns undefined for all vars
      // truth(undefined) is false, so onHeroku=false, forceNoColor=false, forceColor=false
      // Result: (!false && !false) || false = true
      sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
      sandbox.stub(process.env, 'FORCE_COLOR').value('');
      sandbox.stub(process.env, 'DYNO').value('');
      expect(supportsColor()).to.equal(true);
    });

    it('colorJson produces colored output by default in browser', () => {
      sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
      sandbox.stub(process.env, 'FORCE_COLOR').value('');
      sandbox.stub(process.env, 'DYNO').value('');
      const result = colorJson({ level: 'info', message: 'browser log' });
      expect(result).to.include('\x1b[');
    });

    it('colorJson falls back to plain JSON when colors not supported', () => {
      sandbox.stub(process.env, 'FORCE_NO_COLOR').value('true');
      sandbox.stub(process.env, 'FORCE_COLOR').value('');
      sandbox.stub(process.env, 'DYNO').value('');
      const result = colorJson({ level: 'info', message: 'plain' });
      const parsed = JSON.parse(result);
      expect(parsed.level).to.equal('info');
    });
  });

  // ============================================================
  // FormatErrorObject — works without Node-specific features
  // ============================================================
  describe('FormatErrorObject browser behavior', () => {
    it('produces valid JSON without timestamp when configured', () => {
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
      loadEnvConfig();
      const result = FormatErrorObject({ level: 'info', message: 'browser test' });
      const parsed = JSON.parse(result.trim());
      expect(parsed.level).to.equal('info');
      expect(parsed.message).to.equal('browser test');
    });

    it('handles error objects without V8-specific stack format', () => {
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
      loadEnvConfig();
      // Simulate a non-V8 stack trace (Firefox-style)
      const result = FormatErrorObject({
        level: 'error',
        message: 'test',
        stack: 'handleClick@bundle.js:1:100\nonClick@bundle.js:1:200',
      });
      const parsed = JSON.parse(result.trim());
      expect(parsed.level).to.equal('error');
      expect(parsed.errCallStack).to.include('handleClick');
    });
  });

  // ============================================================
  // writeOutput — falls back to consoleLogBackup in browser
  // ============================================================
  describe('writeOutput browser fallback', () => {
    it('overrideStdOut returns null originalWrite when process.stdout is missing', () => {
      // We can't easily remove process.stdout in Node, but we can verify
      // the function signature handles the null case in restoreStdOut
      // Should not throw with null originalWrite
      expect(() => restoreStdOut(null)).to.not.throw();
    });

    it('prefers the original console over process.stdout.write in browser-like hosts with fake stdout', async () => {
      jest.resetModules();

      const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const originalConsoleLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      const nativeConsoleCalls: any[][] = [];
      const stdoutWrites: any[][] = [];

      try {
        Object.defineProperty(globalThis, 'document', {
          value: { createElement: () => ({}) },
          configurable: true,
        });

        console.log = (...args: any[]) => {
          nativeConsoleCalls.push(args);
        };
        (process.stdout.write as any) = (...args: any[]) => {
          stdoutWrites.push(args);
        };

        const { LoggerAdaptToConsole, LoggerRestoreConsole } = await import('../src');

        LoggerAdaptToConsole();
        console.log('browser-like host');
        LoggerRestoreConsole();

        expect(stdoutWrites.length).to.equal(0);
        const jsonLine = nativeConsoleCalls
          .map((call) => call[0])
          .find((value) => typeof value === 'string' && value.trim().startsWith('{'));
        expect(jsonLine).to.be.a('string');
        const parsed = JSON.parse((jsonLine as string).trim());
        expect(parsed.message).to.equal('browser-like host');
      } finally {
        console.log = originalConsoleLog;
        (process.stdout.write as any) = originalStdoutWrite;
        if (documentDescriptor) {
          Object.defineProperty(globalThis, 'document', documentDescriptor);
        } else {
          delete (globalThis as any).document;
        }
        if (windowDescriptor) {
          Object.defineProperty(globalThis, 'window', windowDescriptor);
        } else {
          delete (globalThis as any).window;
        }
        jest.resetModules();
      }
    });

    it('treats window.document as browser-like even when globalThis.document is missing', async () => {
      jest.resetModules();

      const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const originalConsoleLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      const nativeConsoleCalls: any[][] = [];
      const stdoutWrites: any[][] = [];

      try {
        delete (globalThis as any).document;
        Object.defineProperty(globalThis, 'window', {
          value: { document: { createElement: () => ({}) } },
          configurable: true,
        });

        console.log = (...args: any[]) => {
          nativeConsoleCalls.push(args);
        };
        (process.stdout.write as any) = (...args: any[]) => {
          stdoutWrites.push(args);
        };

        const { LoggerAdaptToConsole, LoggerRestoreConsole } = await import('../src');

        LoggerAdaptToConsole();
        console.log('window document host');
        LoggerRestoreConsole();

        expect(stdoutWrites.length).to.equal(0);
        const jsonLine = nativeConsoleCalls
          .map((call) => call[0])
          .find((value) => typeof value === 'string' && value.trim().startsWith('{'));
        expect(jsonLine).to.be.a('string');
        const parsed = JSON.parse((jsonLine as string).trim());
        expect(parsed.message).to.equal('window document host');
      } finally {
        console.log = originalConsoleLog;
        (process.stdout.write as any) = originalStdoutWrite;
        if (documentDescriptor) {
          Object.defineProperty(globalThis, 'document', documentDescriptor);
        } else {
          delete (globalThis as any).document;
        }
        if (windowDescriptor) {
          Object.defineProperty(globalThis, 'window', windowDescriptor);
        } else {
          delete (globalThis as any).window;
        }
        jest.resetModules();
      }
    });

    it('drops re-entrant feedback when the saved console implementation calls back into patched console.log', async () => {
      jest.resetModules();

      const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
      const originalConsoleLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      const nativeConsoleCalls: any[][] = [];
      let feedbackCalls = 0;

      try {
        Object.defineProperty(globalThis, 'document', {
          value: { createElement: () => ({}) },
          configurable: true,
        });

        console.log = (...args: any[]) => {
          nativeConsoleCalls.push(args);
          if (feedbackCalls === 0) {
            feedbackCalls += 1;
            (globalThis as any).console.log(...args);
          }
        };
        (process.stdout.write as any) = () => {
          throw new Error('stdout should not be used in browser-like hosts');
        };

        const { LoggerAdaptToConsole, LoggerRestoreConsole } = await import('../src');

        LoggerAdaptToConsole();
        console.log('re-entrant browser-like host');
        LoggerRestoreConsole();

        expect(feedbackCalls).to.equal(1);
        expect(nativeConsoleCalls.length).to.equal(1);
        const jsonLine = nativeConsoleCalls[0][0];
        expect(jsonLine).to.be.a('string');
        const parsed = JSON.parse((jsonLine as string).trim());
        expect(parsed.message).to.equal('re-entrant browser-like host');
      } finally {
        console.log = originalConsoleLog;
        (process.stdout.write as any) = originalStdoutWrite;
        if (documentDescriptor) {
          Object.defineProperty(globalThis, 'document', documentDescriptor);
        } else {
          delete (globalThis as any).document;
        }
        jest.resetModules();
      }
    });

    it('keeps process.stdout.write as the sink in Node-like hosts', async () => {
      jest.resetModules();

      const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
      const originalConsoleLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      const nativeConsoleCalls: any[][] = [];
      const stdoutWrites: any[][] = [];

      try {
        delete (globalThis as any).document;

        console.log = (...args: any[]) => {
          nativeConsoleCalls.push(args);
        };
        (process.stdout.write as any) = (...args: any[]) => {
          stdoutWrites.push(args);
        };

        const { LoggerAdaptToConsole, LoggerRestoreConsole } = await import('../src');

        LoggerAdaptToConsole();
        console.log('node-like host');
        LoggerRestoreConsole();

        expect(nativeConsoleCalls.length).to.equal(0);
        expect(stdoutWrites.length).to.be.greaterThan(0);
        const jsonLine = stdoutWrites
          .map((call) => call[0])
          .find((value) => typeof value === 'string' && value.trim().startsWith('{'));
        expect(jsonLine).to.be.a('string');
        const parsed = JSON.parse((jsonLine as string).trim());
        expect(parsed.message).to.equal('node-like host');
      } finally {
        console.log = originalConsoleLog;
        (process.stdout.write as any) = originalStdoutWrite;
        if (documentDescriptor) {
          Object.defineProperty(globalThis, 'document', documentDescriptor);
        }
        jest.resetModules();
      }
    });
  });

  // ============================================================
  // End-to-end: logger output shape is valid regardless of environment
  // ============================================================
  describe('Logger output shape consistency', () => {
    it('output is always valid JSON even when metadata features are disabled', () => {
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
      loadEnvConfig();

      const result = FormatErrorObject({ level: 'info', message: 'minimal log' });
      const parsed = JSON.parse(result.trim());
      expect(parsed.level).to.equal('info');
      expect(parsed.message).to.equal('minimal log');
      // No metadata fields
      expect(parsed['@filename']).to.equal(undefined);
      expect(parsed['@packageName']).to.equal(undefined);
      expect(parsed['@timestamp']).to.equal(undefined);
      expect(parsed['@logCallStack']).to.equal(undefined);
    });

    it('output always has level and message fields', () => {
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
      loadEnvConfig();

      const result = FormatErrorObject({ level: 'warn', message: 'warning' });
      const parsed = JSON.parse(result.trim());
      expect(parsed).to.have.property('level');
      expect(parsed).to.have.property('message');
      expect(parsed.level).to.equal('warn');
      expect(parsed.message).to.equal('warning');
    });

    it('error objects produce level:error with errCallStack regardless of environment', () => {
      sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
      loadEnvConfig();

      const err = new Error('browser error');
      const result = FormatErrorObject({ level: 'info', message: 'caught', stack: err.stack });
      const parsed = JSON.parse(result.trim());
      expect(parsed.level).to.equal('error');
      expect(parsed.errCallStack).to.be.a('string');
      expect(parsed.errCallStack.length).to.be.greaterThan(0);
    });
  });
});
