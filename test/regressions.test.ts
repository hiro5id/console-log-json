/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ErrorWithContext,
  GetLogLevel,
  LoggerAdaptToConsole,
  LoggerAdaptToConsoleOptions,
  LoggerRestoreConsole,
  logUsingConsoleJson,
  LOG_LEVEL,
  overrideStdOut,
  restoreStdOut,
  SetLogLevel,
} from '../src';
import { getParentDir } from '../src/get-app-root';
import { stripParentDir } from '../src/get-calling-filename';
import { jsonStringifySafe } from '../src/json-stringify-safe/stringify-safe';
import { colorJson, resetBackgroundThemeCache } from '../src/colors/colorize';
import { FormatStackTrace, getParentPathForms, stripFirstParentPathForm } from '../src/format-stack-trace';
import { getCallStackFromString } from '../src/get-call-stack';

/**
 * Regression tests for logic bugs found in a full code review.
 * Each describe block names the behavior that used to be wrong.
 */
const PROJECT_ROOT = path.resolve(__dirname, '..');
const QUIET: LoggerAdaptToConsoleOptions = { noTimeStamp: true, noFileName: true, noPackageName: true, noStackForNonError: true };

function capture(options: LoggerAdaptToConsoleOptions, action: () => void): any[] {
  const { originalWrite, outputText } = overrideStdOut();
  LoggerAdaptToConsole({ ...QUIET, ...options });
  try {
    action();
  } finally {
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();
  }
  return outputText.map((line) => JSON.parse(line));
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('regressions', () => {
  afterEach(() => {
    SetLogLevel(LOG_LEVEL.info);
  });

  describe('console.log inside user hooks', () => {
    it('does not recurse when transformOutput calls console.log', () => {
      let transformCalls = 0;
      const logs = capture(
        {
          transformOutput: (output) => {
            transformCalls += 1;
            console.log('from inside transform');
            return { ...output, transformed: true };
          },
        },
        () => console.log('hello'),
      );

      expect(transformCalls).to.equal(1);
      expect(logs.map((l) => l.message)).to.deep.equal(['from inside transform', 'hello']);
      // The nested log is written as-is; hooks don't run for logs emitted by a hook.
      expect(logs[0].transformed).to.equal(undefined);
      expect(logs[1].transformed).to.equal(true);
    });

    it('does not loop forever when onLog calls console.log', async () => {
      const seen: string[] = [];
      const { originalWrite, outputText } = overrideStdOut();
      LoggerAdaptToConsole({
        ...QUIET,
        onLog: (_json, parsed) => {
          seen.push(parsed.message);
          console.log('from inside onLog');
        },
      });
      try {
        console.log('hello');
        // Before the fix this never returned: the microtask chain starved the timer.
        await tick(50);
      } finally {
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
      }

      expect(seen).to.deep.equal(['hello']);
      expect(outputText.map((line) => JSON.parse(line).message)).to.deep.equal(['hello', 'from inside onLog']);
    });
  });

  describe('redaction of keys renamed during merging', () => {
    it('redacts the _-prefixed copy created when two context objects share a key', () => {
      const [log] = capture({ redact: ['password', 'user.token', '_secret'] }, () =>
        console.log('login', { password: 'first', user: { token: 't1' }, _secret: 's1' }, { password: 'second', user: { token: 't2' }, _secret: 's2' }),
      );

      expect(log.password).to.equal('Redacted');
      expect(log._password).to.equal('Redacted');
      expect(log.user.token).to.equal('Redacted');
      expect(log.user._token).to.equal('Redacted');
      expect(log._secret).to.equal('Redacted');
      expect(log.__secret).to.equal('Redacted');
      expect(JSON.stringify(log)).to.not.match(/second|t2|s2/);
    });

    it('redacts a renamed copy whose case differs from the path', () => {
      const [log] = capture({ redact: ['password'] }, () => console.log('login', { password: 'first' }, { Password: 'second' }));

      expect(log.password).to.equal('Redacted');
      expect(log._Password).to.equal('Redacted');
    });
  });

  describe('@filename', () => {
    it('is relative to the directory containing the project root', () => {
      const [log] = capture({ noFileName: false }, () => console.log('hello'));

      const expected = path.relative(path.dirname(PROJECT_ROOT), __filename).split(path.sep).join('/');
      expect(log['@filename']).to.equal(expected);
    });
  });

  describe('BigInt values', () => {
    it('are logged as strings instead of dropping the log line', () => {
      const [log] = capture({}, () => console.log('count', { n: BigInt(10), nested: { big: BigInt('12345678901234567890') } }));

      expect(log.message).to.equal('count');
      expect(log.n).to.equal('10');
      expect(log.nested.big).to.equal('12345678901234567890');
    });
  });

  describe('context objects with error-like property names', () => {
    it('keeps a context object that has a stack key, as plain data', () => {
      const [log] = capture({}, () => console.log('deploy', { stack: 'prod-eu', region: 'eu' }));

      expect(log.level).to.equal('info');
      expect(log.message).to.equal('deploy');
      expect(log.stack).to.equal('prod-eu');
      expect(log.region).to.equal('eu');
      expect(log.errCallStack).to.equal(undefined);
    });

    it("keeps a context object with name: 'Error'", () => {
      const [log] = capture({}, () => console.log('event', { name: 'Error', code: 7 }));

      expect(log.name).to.equal('Error');
      expect(log.code).to.equal(7);
    });
  });

  describe('caller input is not mutated', () => {
    it('leaves the level key on the caller object passed as a level override', () => {
      const context = { level: 'warn', user: 1 };
      const [log] = capture({}, () => console.log('x', context));

      expect(log.level).to.equal('warn');
      expect(log.user).to.equal(1);
      expect(context).to.deep.equal({ level: 'warn', user: 1 });
    });

    it('still treats an Error with a leading level key as an error', () => {
      const error: any = new Error('boom');
      error.level = 'warn';
      const [log] = capture({}, () => console.log(error));

      expect(log.errCallStack).to.be.a('string');
      expect(error.level).to.equal('warn');
    });

    it('does not append metadata to the array passed to logUsingConsoleJson', () => {
      const args: any[] = ['hello', { a: 1 }];
      capture({ noFileName: false, debugString: true }, () => logUsingConsoleJson(args, LOG_LEVEL.info));

      expect(args).to.deep.equal(['hello', { a: 1 }]);
    });

    it('does not change the original error message in new ErrorWithContext(error, string)', () => {
      const original = new Error('orig');
      const wrapped = new ErrorWithContext(original, 'extra' as any);

      expect(original.message).to.equal('orig');
      expect(wrapped.message).to.equal('orig - extra');
    });
  });

  describe('context objects with a level field that is not a log level', () => {
    it('keeps the field as data and keeps the console method level', () => {
      const logs = capture({}, () => {
        console.error('game over', { level: 5, score: 100 });
        console.warn('quest', { level: 'high', zone: 'north' });
      });

      expect(logs[0].level).to.equal('error');
      expect(logs[0]._level).to.equal(5);
      expect(logs[0].score).to.equal(100);
      expect(logs[1].level).to.equal('warn');
      expect(logs[1]._level).to.equal('high');
      expect(logs[1].zone).to.equal('north');
    });

    it('keeps the field when an error is logged with the context', () => {
      const [log] = capture({}, () => console.log('save failed', new Error('disk'), { level: 5 }));

      expect(log.level).to.equal('error');
      expect(log._level).to.equal(5);
    });

    it('still applies a valid level override in a later argument', () => {
      const [log] = capture({}, () => console.log('mixed', { level: 5 }, { level: 'WARN' }));

      expect(log.level).to.equal('warn');
      expect(log._level).to.equal(5);
    });
  });

  describe('SetLogLevel', () => {
    it('normalizes the level like the logLevel option does', () => {
      SetLogLevel('WARN');
      expect(GetLogLevel()).to.equal('warn');

      SetLogLevel(' Warning ');
      expect(GetLogLevel()).to.equal('warn');
    });

    it('keeps the current level when given an unknown value', () => {
      SetLogLevel('error');
      SetLogLevel('not-a-level');
      expect(GetLogLevel()).to.equal('error');
    });

    it('filters messages after SetLogLevel with an uppercase level', () => {
      const logs = capture({}, () => {
        SetLogLevel('WARN');
        console.info('hidden');
        console.warn('shown');
      });

      expect(logs.map((l) => l.message)).to.deep.equal(['shown']);
    });
  });

  describe('debugString', () => {
    it('serializes null and undefined arguments instead of failing', () => {
      const [log] = capture({ debugString: true }, () => console.log('a', null, undefined));

      expect(log._loggerDebug).to.deep.equal(['"a"', 'null', 'undefined']);
    });
  });

  describe('path helpers behind @filename and stack trace stripping', () => {
    it('getParentDir matches path.join(root, "..") for POSIX and Windows roots', () => {
      expect(getParentDir('/home/me/my-app')).to.equal('/home/me');
      expect(getParentDir('/app')).to.equal('/');
      expect(getParentDir('C:\\work\\my-app')).to.equal('C:\\work');
      expect(getParentDir('C:\\my-app')).to.equal('C:\\');
      expect(getParentDir('C:/my-app')).to.equal('C:/');
      expect(getParentDir('my-app')).to.equal('');
      expect(getParentDir('')).to.equal('');
    });

    it('stripParentDir reports paths starting with the project folder name', () => {
      expect(stripParentDir('/home/me/my-app/src/index.ts', '/home/me')).to.equal('my-app/src/index.ts');
      expect(stripParentDir('/app/src/index.ts', '/')).to.equal('app/src/index.ts');
      expect(stripParentDir('C:/work/my-app/src/index.ts', 'C:\\work')).to.equal('my-app/src/index.ts');
      expect(stripParentDir('C:/my-app/src/index.ts', 'C:\\')).to.equal('my-app/src/index.ts');
    });

    it('stripParentDir leaves paths outside the parent dir alone, apart from a leading slash', () => {
      // Only a whole directory prefix is removed: /home/me must not match /home/meg.
      expect(stripParentDir('/home/meg/other/file.ts', '/home/me')).to.equal('home/meg/other/file.ts');
      expect(stripParentDir('/opt/lib/file.ts', '/home/me')).to.equal('opt/lib/file.ts');
      expect(stripParentDir('relative/file.ts', '')).to.equal('relative/file.ts');
    });
  });

  describe('additional edge cases', () => {
    it('keeps a non-level `level` field as `__level` when `_level` is already taken', () => {
      const [log] = capture({}, () => console.error('x', { level: 5, _level: 'mine' }));

      expect(log.level).to.equal('error');
      expect(log._level).to.equal('mine');
      expect(log.__level).to.equal(5);
    });

    it('treats an empty or non-string level value as context, not an override', () => {
      const logs = capture({}, () => {
        console.warn('a', { level: '' });
        console.warn('b', { level: null });
      });

      expect(logs.map((l) => l.level)).to.deep.equal(['warn', 'warn']);
      expect(logs[0]._level).to.equal('');
      expect(logs[1]._level).to.equal(null);
    });

    it('SetLogLevel keeps the current level for blank or non-string values', () => {
      SetLogLevel('debug');
      SetLogLevel('   ');
      SetLogLevel(undefined as any);
      SetLogLevel(3 as any);
      expect(GetLogLevel()).to.equal('debug');
    });

    it('debugString serializes values plain JSON cannot represent', () => {
      const circular: any = { name: 'loop' };
      circular.self = circular;
      const [log] = capture({ debugString: true }, () => console.log('a', BigInt(7), { n: BigInt(8) }));
      const [circularLog] = capture({ debugString: true }, () => console.log('b', circular));
      expect(circularLog._loggerDebug[1]).to.equal('{"name":"loop","self":"[Circular ~]"}');
      expect(log._loggerDebug).to.deep.equal(['"a"', '"7"', '{"n":"8"}']);
      expect(log.n).to.equal('8');
    });

    it('logs a top-level BigInt as the message without losing precision', () => {
      const logs = capture({}, () => {
        console.log(BigInt('12345678901234567890'));
        console.log('total', BigInt(5));
      });

      expect(logs[0].message).to.equal('12345678901234567890');
      expect(logs[0]['@autoParsedJson']).to.equal(undefined);
      expect(logs[1].message).to.equal('total - 5');
    });

    it('still auto-parses numbers that round-trip exactly', () => {
      const logs = capture({}, () => {
        console.log('42');
        console.log('-3.5');
        console.log('1.50');
      });

      expect(logs[0]['@autoParsedJson']).to.equal(42);
      expect(logs[1]['@autoParsedJson']).to.equal(-3.5);
      // "1.50" would come back as 1.5, so it stays as the original text.
      expect(logs[2].message).to.equal('1.50');
      expect(logs[2]['@autoParsedJson']).to.equal(undefined);
    });

    it('jsonStringifySafe serializes BigInt at the top level and inside arrays', () => {
      expect(jsonStringifySafe(BigInt(1))).to.equal('"1"');
      expect(jsonStringifySafe({ list: [BigInt(2), 3] })).to.equal('{"list":["2",3]}');
    });

    it('ErrorWithContext combines a string context with a string or missing error', () => {
      expect(new ErrorWithContext('base', 'extra' as any).message).to.equal('base - extra');
      expect(new ErrorWithContext(null as any, 'only context' as any).message).to.equal('only context');
    });

    it('ErrorWithContext merges object context into an inner error that has string context', () => {
      const inner = new ErrorWithContext('inner', 'inner note' as any);
      (inner as any).extraContext = 'inner note';
      const outer = new ErrorWithContext(inner, { requestId: 'r1' });

      expect((outer as any).extraContext).to.deep.equal({ message: 'inner note', requestId: 'r1' });
    });

    it('redacts wildcard paths over object keys, including renamed copies', () => {
      const [log] = capture({ redact: ['headers.*', '*.token', 'tags.*'] }, () =>
        console.log('req', { headers: { auth: 'a', cookie: 'c' }, user: { token: 't1', id: 1 }, tags: ['x', 'y'] }, { user: { token: 't2' } }),
      );

      expect(log.tags).to.deep.equal(['Redacted', 'Redacted']);

      expect(log.headers).to.deep.equal({ auth: 'Redacted', cookie: 'Redacted' });
      expect(log.user.token).to.equal('Redacted');
      expect(log.user._token).to.equal('Redacted');
      expect(log.user.id).to.equal(1);
    });

    it('does not redact unrelated keys that merely end with the path name', () => {
      const [log] = capture({ redact: ['token'] }, () => console.log('x', { token: 'secret', csrf_token: 'keep', _tokenizer: 'keep' }));

      expect(log.token).to.equal('Redacted');
      expect(log.csrf_token).to.equal('keep');
      expect(log._tokenizer).to.equal('keep');
    });
  });

  describe('async onLog', () => {
    it('does not re-run onLog for a console.log made after an await inside onLog', async () => {
      const seen: string[] = [];
      const { originalWrite, outputText } = overrideStdOut();
      LoggerAdaptToConsole({
        ...QUIET,
        onLog: async (_json, parsed) => {
          seen.push(parsed.message);
          await tick(5);
          console.log(`shipped ${parsed.message}`);
        },
      });
      try {
        console.log('hello');
        await tick(100);
      } finally {
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
      }

      expect(seen).to.deep.equal(['hello']);
      expect(outputText.map((line) => JSON.parse(line).message)).to.deep.equal(['hello', 'shipped hello']);
    });

    it('still runs onLog for ordinary logs made after an onLog callback has finished', async () => {
      const seen: string[] = [];
      const { originalWrite } = overrideStdOut();
      LoggerAdaptToConsole({ ...QUIET, onLog: (_json, parsed) => void seen.push(parsed.message) });
      try {
        console.log('first');
        await tick(10);
        console.log('second');
        await tick(10);
      } finally {
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
      }

      expect(seen).to.deep.equal(['first', 'second']);
    });
  });

  describe('error stack traces', () => {
    it('logs only the original stack when an error is logged with context', () => {
      const [log] = capture({ noFileName: false, noPackageName: false, noStackForNonError: false }, () => console.error('failed', new Error('boom'), { requestId: 'r1' }));

      expect(log.errCallStack.startsWith('Error: boom')).to.equal(true);
      expect(log.errCallStack).to.not.include('Caused By');
      expect(log.errCallStack).to.not.include('extractParametersFromArguments');
      expect(log.errCallStack).to.include('regressions.test');
      expect(log.requestId).to.equal('r1');
    });

    it('keeps "Caused By" for errors the user wrapped with ErrorWithContext', () => {
      const inner = new Error('inner');
      const [log] = capture({}, () => console.error('failed', new ErrorWithContext(inner, { step: 'save' }), { requestId: 'r1' }));

      expect((log.errCallStack.match(/Caused By:/g) || []).length).to.equal(1);
      expect(log.errCallStack).to.include('Caused By: Error: inner');
      expect(log.step).to.equal('save');
    });

    it('separates the message from any error type with " - "', () => {
      const systemError: any = new Error('bad argument');
      systemError.code = 'ERR_X';
      systemError.stack = systemError.stack.replace(/^Error: /, 'Error [ERR_X]: ');
      class MongoTimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'MongoTimeoutError';
        }
      }

      for (const options of [QUIET, { noFileName: false, noPackageName: false, noStackForNonError: false }]) {
        const logs = capture(options, () => {
          console.error('failed', new TypeError('boom'));
          console.error('startup', new MongoTimeoutError('timed out'));
          console.error('call', systemError);
        });

        expect(logs.map((l) => l.message)).to.deep.equal(['failed - boom', 'startup - timed out', 'call - bad argument']);
      }
    });
  });

  describe('colorized output', () => {
    const originalEnv = { ...process.env };
    const codes = (text: string) => text.replace(/\x1b\[([0-9;]*)m/g, (_m, code) => `<${code}>`);

    beforeEach(() => {
      process.env.FORCE_COLOR = 'true';
      delete process.env.DYNO;
      delete process.env.FORCE_NO_COLOR;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      resetBackgroundThemeCache();
    });

    it('draws separators white on a dark background and black on a light one', () => {
      process.env.CONSOLE_LOG_COLORIZE_BACKGROUND = 'dark';
      resetBackgroundThemeCache();
      expect(codes(colorJson({ a: 1 })).startsWith('<37>{')).to.equal(true);

      process.env.CONSOLE_LOG_COLORIZE_BACKGROUND = 'light';
      resetBackgroundThemeCache();
      expect(codes(colorJson({ a: 1 })).startsWith('<30>{')).to.equal(true);
    });

    it('respects an explicitly configured separator color', () => {
      process.env.CONSOLE_LOG_COLORIZE_BACKGROUND = 'dark';
      resetBackgroundThemeCache();
      expect(codes(colorJson({ a: 1 }, { separator: 'cyan' })).startsWith('<36>{')).to.equal(true);
    });

    it('colors every value in an array with its key, including nested arrays', () => {
      process.env.CONSOLE_LOG_COLORIZE_BACKGROUND = 'dark';
      resetBackgroundThemeCache();
      const output = codes(colorJson({ tags: ['a', 'b', 3, true, null], matrix: [[1, 2]], items: [{ id: 7 }] }));
      // [color, token] for every colored token, in order.
      const tokens = Array.from(output.matchAll(/<([0-9;]+)>([^<]+)/g)).map((match) => [match[1], match[2]]);
      const colorOf = (token: string, occurrence = 0) => tokens.filter((pair) => pair[1] === token)[occurrence][0];

      const tagColor = colorOf('"a"');
      expect([colorOf('"b"'), colorOf('3'), colorOf('true'), colorOf('null')]).to.deep.equal([tagColor, tagColor, tagColor, tagColor]);
      expect(colorOf('1')).to.equal(colorOf('2'));
      expect(colorOf('1')).to.not.equal(tagColor);
      // Objects inside arrays use their own keys' colors.
      expect(colorOf('7')).to.not.equal(colorOf('1'));
      expect(colorOf('7')).to.not.equal(tagColor);
    });
  });

  describe('Windows and file-URL stack paths', () => {
    it('lists the native and file-URL forms of the parent dir', () => {
      expect(getParentPathForms('/home/me')).to.deep.equal(['/home/me']);
      expect(getParentPathForms('/home/my user')).to.deep.equal(['/home/my user', '/home/my%20user']);
      expect(getParentPathForms('C:\\work')).to.deep.equal(['C:\\work', '/C:/work', 'C:/work']);
    });

    it('strips the parent dir from CommonJS and ES module frames on Windows', () => {
      const forms = getParentPathForms('C:\\work');
      expect(stripFirstParentPathForm(' fn (C:\\work\\app\\src\\a.js:1:1)', forms)).to.equal(' fn (\\app\\src\\a.js:1:1)');
      expect(stripFirstParentPathForm(' fn (file:///C:/work/app/src/a.mjs:1:1)', forms)).to.equal(' fn (file:///app/src/a.mjs:1:1)');
      expect(stripFirstParentPathForm(' fn (/elsewhere/a.js:1:1)', forms)).to.equal(' fn (/elsewhere/a.js:1:1)');
    });

    it('strips a percent-encoded parent dir from ES module frames', () => {
      const forms = getParentPathForms('/home/my user');
      expect(stripFirstParentPathForm(' fn (file:///home/my%20user/app/a.mjs:1:1)', forms)).to.equal(' fn (file:///app/a.mjs:1:1)');
    });

    it('drops library frames that use backslashes from stack traces', () => {
      const stack = [
        'Error: boom',
        '    at userCode (C:\\work\\app\\src\\a.js:1:1)',
        '    at internal (C:\\work\\app\\node_modules\\console-log-json\\dist\\src\\logger.js:1:1)',
      ].join('\n');
      const lines = FormatStackTrace.toArray(stack);

      expect(lines.some((line) => line.includes('console-log-json'))).to.equal(false);
      expect(lines.some((line) => line.includes('a.js'))).to.equal(true);
    });

    it('skips leading library frames with backslashes in @logCallStack', () => {
      const stack = [
        'Error',
        '    at captureSomething (C:\\work\\app\\node_modules\\console-log-json\\dist\\src\\x.js:1:1)',
        '    at userCode (C:\\work\\app\\src\\a.js:1:1)',
      ].join('\n');

      expect(getCallStackFromString(stack).trim().startsWith('userCode')).to.equal(true);
    });
  });

  describe('runtime behavior of the built package', () => {
    const distCjs = path.join(PROJECT_ROOT, 'dist', 'index.js');
    const distEsm = path.join(PROJECT_ROOT, 'dist', 'esm', 'index.mjs');
    let workDir: string;

    beforeAll(() => {
      if (!fs.existsSync(distCjs) || !fs.existsSync(distEsm)) {
        throw new Error('dist/ not found — run "npm run build" before this test');
      }
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clj-runtime-'));
    });

    afterAll(() => {
      if (workDir) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    });

    it('does not keep the process alive for onLogTimeout after a hung onLog callback', () => {
      const script = path.join(workDir, 'hung-onlog.js');
      fs.writeFileSync(
        script,
        `const L = require(${JSON.stringify(distCjs)});
         L.LoggerAdaptToConsole({ onLog: () => new Promise(() => {}), onLogTimeout: 20000 });
         console.log('hello');`,
      );

      const started = Date.now();
      execFileSync(process.execPath, [script], { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 });
      expect(Date.now() - started).to.be.lessThan(10000);
    }, 20000);

    it('reports @filename relative to the parent of the consumer project root', () => {
      // A nested consumer project: with a project directly under "/", stripping only the
      // leading slash would give the same answer, so this needs a real parent dir to remove.
      const projectDir = path.join(fs.realpathSync(workDir), 'cjs-consumer');
      fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'cjs-consumer', private: true }));
      const script = path.join(projectDir, 'src', 'app.js');
      fs.writeFileSync(
        script,
        `const L = require(${JSON.stringify(distCjs)});
         L.LoggerAdaptToConsole({ noTimeStamp: true, noStackForNonError: true });
         console.log('hello');
         console.error('failed', new Error('boom'));`,
      );

      const output = execFileSync(process.execPath, [script], { cwd: projectDir, encoding: 'utf8' });
      const [infoLog, errorLog] = output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      const parentDir = path.dirname(projectDir);

      expect(infoLog['@filename']).to.equal('cjs-consumer/src/app.js');
      // Stack traces strip the same parent directory as @filename.
      expect(errorLog.errCallStack).to.include(`${path.sep}cjs-consumer${path.sep}src${path.sep}app.js`);
      expect(errorLog.errCallStack).to.not.include(parentDir);
    }, 20000);

    // The ESM build needs process.getBuiltinModule (Node >= 20.16 / 22.3) to load fs/path synchronously.
    const itWithBuiltinModule = typeof (process as any).getBuiltinModule === 'function' ? it : it.skip;

    itWithBuiltinModule(
      'strips the project path from stack traces in the ESM build, like the CJS build',
      () => {
        // A throwaway consumer project, so its parent dir is a real, non-root path to strip.
        const projectDir = path.join(fs.realpathSync(workDir), 'esm-consumer');
        fs.mkdirSync(projectDir);
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'esm-consumer', private: true }));
        // Install the ESM bundle where a consumer would have it, so the library's own
        // frames are recognized as internal (they live under node_modules/console-log-json/).
        const installedDir = path.join(projectDir, 'node_modules', 'console-log-json');
        fs.mkdirSync(path.join(installedDir, 'dist', 'esm'), { recursive: true });
        fs.copyFileSync(distEsm, path.join(installedDir, 'dist', 'esm', 'index.mjs'));
        fs.writeFileSync(path.join(installedDir, 'package.json'), JSON.stringify({ name: 'console-log-json', exports: { '.': { import: './dist/esm/index.mjs' } } }));
        const script = path.join(projectDir, 'esm-stack.mjs');
        fs.writeFileSync(
          script,
          `import { LoggerAdaptToConsole } from 'console-log-json';
         LoggerAdaptToConsole({ noTimeStamp: true });
         console.error('failed', new Error('boom'));`,
        );

        const output = execFileSync(process.execPath, [script], { cwd: projectDir, encoding: 'utf8' });
        const log = JSON.parse(output.trim().split('\n')[0]);
        const parentDir = path.dirname(projectDir).split(path.sep).join('/');

        expect(log.message).to.equal('failed - boom');
        expect(log.errCallStack).to.include('/esm-consumer/esm-stack.mjs');
        expect(log.errCallStack).to.not.include(parentDir);
        expect(log['@logCallStack']).to.not.include(parentDir);
        expect(log['@filename']).to.equal('esm-consumer/esm-stack.mjs');
        expect(log['@packageName']).to.equal('esm-consumer');
      },
      20000,
    );

    it('does not freeze a browser page when an async onLog logs after an await (no AsyncLocalStorage)', () => {
      // Browser-style bundle of the source, run in a VM context without Node globals, in a
      // child process with a timeout: a starved event loop would otherwise hang the test run.
      const script = path.join(workDir, 'browser-onlog.js');
      fs.writeFileSync(
        script,
        `const esbuild = require(${JSON.stringify(require.resolve('esbuild'))});
         const vm = require('vm');
         const bundle = esbuild.buildSync({
           entryPoints: [${JSON.stringify(path.join(PROJECT_ROOT, 'src', 'index.ts'))}],
           bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'ConsoleLogJson',
           define: { 'process.env': '{}', 'process.cwd': 'undefined' }, logLevel: 'silent',
         }).outputFiles[0].text;
         const writes = [];
         const sandbox = { console: { log: (t) => writes.push(t), error: (t) => writes.push(t), warn() {}, info() {}, debug() {} }, Promise, setTimeout, clearTimeout, URL };
         sandbox.globalThis = sandbox;
         vm.createContext(sandbox);
         vm.runInContext(bundle, sandbox);
         vm.runInContext("ConsoleLogJson.LoggerAdaptToConsole({ noTimeStamp: true, noFileName: true, noStackForNonError: true, onLog: async () => { await null; console.log('inner'); } }); console.log('hello');", sandbox);
         setTimeout(() => { process.stdout.write(JSON.stringify({ timerFired: true, firstMessage: JSON.parse(writes[0]).message })); process.exit(0); }, 50);`,
      );

      const output = execFileSync(process.execPath, [script], { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000 });
      expect(JSON.parse(output)).to.deep.equal({ timerFired: true, firstMessage: 'hello' });
    }, 20000);

    function makeEsmConsumer(name: string, installUnderNodeModules: boolean): { projectDir: string; importSpecifier: string } {
      const projectDir = path.join(fs.realpathSync(workDir), name);
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name, private: true }));
      if (installUnderNodeModules) {
        const installedDir = path.join(projectDir, 'node_modules', 'console-log-json');
        fs.mkdirSync(path.join(installedDir, 'dist', 'esm'), { recursive: true });
        fs.copyFileSync(distEsm, path.join(installedDir, 'dist', 'esm', 'index.mjs'));
        fs.writeFileSync(path.join(installedDir, 'package.json'), JSON.stringify({ name: 'console-log-json', exports: { '.': { import: './dist/esm/index.mjs' } } }));
        return { projectDir, importSpecifier: 'console-log-json' };
      }
      // Vendored somewhere that path hints like node_modules/console-log-json/ don't match.
      const vendoredDir = path.join(projectDir, 'vendor', 'logging');
      fs.mkdirSync(vendoredDir, { recursive: true });
      fs.copyFileSync(distEsm, path.join(vendoredDir, 'index.mjs'));
      return { projectDir, importSpecifier: './vendor/logging/index.mjs' };
    }

    function parseLogLines(output: string): any[] {
      return output
        .trim()
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line));
    }

    it('works on Node versions without process.getBuiltinModule once require loads asynchronously', () => {
      const { projectDir, importSpecifier } = makeEsmConsumer('esm-old-node', true);
      const script = path.join(projectDir, 'app.mjs');
      fs.writeFileSync(
        script,
        `import { LoggerAdaptToConsole } from ${JSON.stringify(importSpecifier)};
         LoggerAdaptToConsole({ noTimeStamp: true });
         console.error('early', new Error('first'));
         setTimeout(() => console.error('later', new Error('second')), 100);`,
      );
      // Simulate Node < 20.16 / 22.3, which has no process.getBuiltinModule.
      const preload = path.join(projectDir, 'no-builtin-module.mjs');
      fs.writeFileSync(preload, 'delete process.getBuiltinModule;');

      const output = execFileSync(process.execPath, ['--import', pathToFileUrl(preload), script], { cwd: projectDir, encoding: 'utf8' });
      const logs = parseLogLines(output);
      const parentDir = path.dirname(projectDir).split(path.sep).join('/');

      expect(logs.map((l) => l.message)).to.deep.equal(['early - first', 'later - second']);
      // Logs after the async require is ready get the same path stripping as on newer Node.
      expect(logs[1].errCallStack).to.include('/esm-old-node/app.mjs');
      expect(logs[1].errCallStack).to.not.include(parentDir);
      expect(logs[1]['@packageName']).to.equal('esm-old-node');
    }, 20000);

    itWithBuiltinModule(
      'reports the right @filename when the ESM bundle is not under node_modules/console-log-json',
      () => {
        const { projectDir, importSpecifier } = makeEsmConsumer('esm-vendored', false);
        const script = path.join(projectDir, 'app.mjs');
        fs.writeFileSync(
          script,
          `import { LoggerAdaptToConsole } from ${JSON.stringify(importSpecifier)};
         LoggerAdaptToConsole({ noTimeStamp: true });
         console.log('hello');`,
        );

        const [log] = parseLogLines(execFileSync(process.execPath, [script], { cwd: projectDir, encoding: 'utf8' }));
        expect(log['@filename']).to.equal('esm-vendored/app.mjs');
        expect(log['@logCallStack']).to.not.include('vendor/logging');
      },
      20000,
    );
  });
});

function pathToFileUrl(filePath: string): string {
  const forwardSlashed = filePath.split(path.sep).join('/');
  return encodeURI(`file://${forwardSlashed.startsWith('/') ? '' : '/'}${forwardSlashed}`);
}
