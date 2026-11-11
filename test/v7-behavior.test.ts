/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import { LoggerAdaptToConsole, LoggerAdaptToConsoleOptions, LoggerRestoreConsole, LOG_LEVEL, overrideStdOut, restoreStdOut, SetLogLevel } from './support/logger';
import { resetBackgroundThemeCache } from '../src/colors/colorize';
import { stubEnv } from './support/env';
import * as fs from 'fs';
import * as path from 'path';
import { LOGGER_ENV_VARS } from '../src/logger-support/types';

/**
 * Behavior introduced in 7.0.0: explicitly patched console methods, noStackForNonError keeping the
 * stack on errors, customOptions staying top-level under contextKey, explicit level beating an Error,
 * transformOutput fallback, the onLog abort signal, colorizeBackground, and repeated initialization.
 */
const QUIET: LoggerAdaptToConsoleOptions = { noTimeStamp: true, noFileName: true, noPackageName: true, noStackForNonError: true };

function captureRaw(options: LoggerAdaptToConsoleOptions, action: () => void): string[] {
  const { originalWrite, outputText } = overrideStdOut();
  LoggerAdaptToConsole({ ...QUIET, ...options });
  try {
    action();
  } finally {
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();
  }
  return outputText;
}

function capture(options: LoggerAdaptToConsoleOptions, action: () => void): any[] {
  return captureRaw(options, action).map((line) => JSON.parse(line));
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('7.0.0 behavior', () => {
  afterEach(() => {
    SetLogLevel(LOG_LEVEL.info);
  });

  describe('output framing', () => {
    it('ends every entry with exactly one newline', () => {
      const lines = captureRaw({}, () => {
        console.log('one');
        console.error(new Error('two'));
      });
      for (const line of lines) {
        expect(line.endsWith('}\n')).to.equal(true);
        expect(line.endsWith('\n\n')).to.equal(false);
      }
    });

    it('accepts the deprecated noNewLineCharactersExceptStack without changing the output', () => {
      const withFlag = captureRaw({ noNewLineCharactersExceptStack: true }, () => console.error(new Error('boom')));
      const without = captureRaw({}, () => console.error(new Error('boom')));
      // Both stacks point at their own call site, so compare everything else.
      const strip = (line: string) => JSON.stringify({ ...JSON.parse(line), errCallStack: undefined, '@logCallStack': undefined });
      expect(strip(withFlag[0])).to.equal(strip(without[0]));
      expect(JSON.parse(withFlag[0]).errCallStack).to.include('\n    at ');
    });
  });

  describe('key order', () => {
    it('sorts nested context keys even when no metadata is merged in', () => {
      const [quiet] = captureRaw({}, () => console.log('x', { payment: { card: { number: '1', brand: 'visa' } } }));
      expect(quiet).to.include('"card":{"brand":"visa","number":"1"}');
    });
  });

  describe('message placeholders', () => {
    it('gives an Error with an empty message a placeholder, with or without metadata', () => {
      const [quiet] = capture({}, () => console.error(new Error('')));
      const [withMetadata] = capture({ noFileName: false, noStackForNonError: false }, () => console.error(new Error('')));
      for (const log of [quiet, withMetadata]) {
        expect(log.message).to.equal('<no-error-message-was-passed-to-console-log>');
        expect(Object.keys(log).slice(0, 2)).to.eql(['level', 'message']);
      }
    });
  });

  describe('extended console methods', () => {
    it('console.trace logs at info with @logCallStack, even with noStackForNonError', () => {
      const [log] = capture({}, () => console.trace('checkpoint', { step: 2 }));
      expect(log.level).to.equal('info');
      expect(log.message).to.equal('checkpoint');
      expect(log.step).to.equal(2);
      expect(log['@logCallStack']).to.be.a('string');
      expect(log['@logCallStack'].startsWith('at ')).to.equal(true);
      expect(log['@logCallStack']).to.not.include('consoleJson');
    });

    it('console.trace without arguments logs "Trace"', () => {
      const [log] = capture({}, () => console.trace());
      expect(log.message).to.equal('Trace');
    });

    it('console.table logs the data under @table, projected to the given columns', () => {
      const rows = [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ];
      const [all, projected, scalar] = capture({}, () => {
        console.table(rows);
        console.table(rows, ['a']);
        console.table('just text');
      });
      expect(all).to.eql({ level: 'info', message: '<console-table>', '@table': rows });
      expect(projected['@table']).to.eql([{ a: 1 }, { a: 3 }]);
      expect(scalar).to.eql({ level: 'info', message: 'just text' });
      expect(rows[0]).to.eql({ a: 1, b: 2 });
    });

    it('console.table keeps @table top-level under contextKey and is redactable', () => {
      const [log] = capture({ contextKey: 'context', redact: ['@table[*].secret'] }, () => console.table([{ id: 1, secret: 's' }]));
      expect(log['@table']).to.eql([{ id: 1, secret: 'Redacted' }]);
      expect(log.context).to.equal(undefined);
    });

    it('console.dir and console.dirxml log like console.log', () => {
      const [dir, dirxml] = capture({}, () => {
        console.dir({ x: 1 }, { depth: 0 });
        console.dirxml('markup', { y: 2 });
      });
      expect(dir).to.eql({ level: 'info', message: '<no-message-was-passed-to-console-log>', x: 1 });
      expect(dirxml).to.eql({ level: 'info', message: 'markup', y: 2 });
    });

    it('console.assert logs at error only when the assertion fails', () => {
      const logs = capture({}, () => {
        console.assert(true, 'not logged');
        console.assert(false, 'math broke', { n: 1 });
        console.assert(0 as any);
      });
      expect(logs.length).to.equal(2);
      expect(logs[0].level).to.equal('error');
      expect(logs[0].message).to.equal('Assertion failed - math broke');
      expect(logs[0].n).to.equal(1);
      expect(logs[1].message).to.equal('Assertion failed');
    });

    it('console.count / countReset keep their own counters', () => {
      const logs = capture({}, () => {
        console.count();
        console.count();
        console.count('x');
        console.countReset();
        console.count();
        console.countReset('missing');
      });
      expect(logs.map((log) => log.message)).to.eql(['default: 1', 'default: 2', 'x: 1', 'default: 1', "Count for 'missing' does not exist"]);
      expect(logs[1]).to.include({ '@label': 'default', '@count': 2 });
      expect(logs[4].level).to.equal('warn');
    });

    it('console.time / timeLog / timeEnd log @label and @durationMs', () => {
      const logs = capture({}, () => {
        console.time();
        console.time();
        console.timeLog(undefined, { step: 1 });
        console.timeEnd();
        console.timeEnd();
      });
      expect(logs.map((log) => log.level)).to.eql(['warn', 'info', 'info', 'warn']);
      expect(logs[0].message).to.equal("Label 'default' already exists for console.time()");
      expect(logs[1]['@label']).to.equal('default');
      expect(logs[1]['@durationMs']).to.be.a('number');
      expect(logs[1].step).to.equal(1);
      expect(logs[2].message).to.match(/^default: [\d.]+ms$/);
      expect(logs[3].message).to.equal("No such label 'default' for console.timeEnd()");
    });

    it('console.group logs its label; groupEnd and an empty group log nothing', () => {
      const logs = capture({}, () => {
        console.group('outer');
        console.groupCollapsed('inner', { depth: 2 });
        console.group();
        console.groupEnd();
      });
      expect(logs).to.eql([
        { level: 'info', message: 'outer' },
        { level: 'info', message: 'inner', depth: 2 },
      ]);
    });

    it('respects the log level', () => {
      SetLogLevel(LOG_LEVEL.info);
      const logs = capture({ logLevel: LOG_LEVEL.warn }, () => {
        console.count();
        console.trace('hidden');
        console.assert(false, 'shown');
      });
      expect(logs.map((log) => log.message)).to.eql(['Assertion failed - shown']);
    });

    it('LoggerRestoreConsole restores the native extended methods', () => {
      const nativeTrace = console.trace;
      const nativeTable = console.table;
      LoggerAdaptToConsole(QUIET);
      expect(console.trace).to.not.equal(nativeTrace);
      LoggerRestoreConsole();
      expect(console.trace).to.equal(nativeTrace);
      expect(console.table).to.equal(nativeTable);
    });
  });

  describe('noStackForNonError', () => {
    it('keeps @logCallStack on error logs and drops it on others', () => {
      const [info, error, explicit] = capture({}, () => {
        console.log('plain');
        console.error('failed');
        console.log({ level: 'error' }, 'explicit error');
      });
      expect(info['@logCallStack']).to.equal(undefined);
      expect(error['@logCallStack']).to.be.a('string');
      expect(explicit['@logCallStack']).to.be.a('string');
    });

    it('keeps @logCallStack when an Error is logged with console.log', () => {
      const [log] = capture({}, () => console.log('with error', new Error('boom')));
      expect(log.level).to.equal('error');
      expect(log['@logCallStack']).to.be.a('string');
      expect(log.errCallStack.startsWith('Error: boom')).to.equal(true);
    });
  });

  describe('explicit level override', () => {
    it('wins over an Error', () => {
      const [log] = capture({}, () => console.log({ level: 'warn' }, new Error('degraded')));
      expect(log.level).to.equal('warn');
      expect(log.message).to.equal('degraded');
      expect(log.errCallStack).to.be.a('string');
    });

    it('is filtered by its own level, not the console method level', () => {
      const logs = capture({ logLevel: LOG_LEVEL.warn }, () => {
        console.error({ level: 'debug' }, 'hidden');
        console.debug({ level: 'warn' }, 'shown');
        console.log('also hidden', new Error('x'), { level: 'info' });
      });
      expect(logs.map((log) => log.message)).to.eql(['shown']);
    });

    it('treats a level property on an Error as data', () => {
      const error: any = new Error('boom');
      error.level = 'warn';
      const [log] = capture({}, () => console.log(error));
      expect(log.level).to.equal('error');
    });
  });

  describe('customOptions with contextKey', () => {
    it('keeps customOptions at the top level', () => {
      const [withContext, withoutContext] = capture({ contextKey: 'context', customOptions: { service: 'api' } }, () => {
        console.log('order placed', { orderId: 1 });
        console.log('health check');
      });
      expect(withContext).to.eql({ level: 'info', message: 'order placed', context: { orderId: 1 }, service: 'api' });
      expect(withoutContext).to.eql({ level: 'info', message: 'health check', service: 'api' });
    });

    it('without contextKey, a call-site key keeps its name and the custom option gets the _ prefix', () => {
      const [log] = capture({ customOptions: { service: 'api' } }, () => console.log('x', { service: 'mine' }));
      expect(log.service).to.equal('mine');
      expect(log._service).to.equal('api');
    });

    it('applies customOptions when nothing but a message is logged', () => {
      const [log] = capture({ customOptions: { region: 'eu' } }, () => console.log('only a message'));
      expect(log).to.eql({ level: 'info', message: 'only a message', region: 'eu' });
    });
  });

  describe('transformOutput fallback', () => {
    it('falls back to the unmodified output when the transform mutates and then throws', () => {
      const [log] = capture(
        {
          transformOutput: (output) => {
            output.status = output.level;
            delete output.level;
            throw new Error('oops');
          },
        },
        () => console.log('still works'),
      );
      expect(log).to.eql({ level: 'info', message: 'still works' });
    });
  });

  describe('onLog abort signal', () => {
    it('passes a signal that aborts after onLogTimeout', async () => {
      let aborted = false;
      let receivedSignal: any;
      capture(
        {
          onLogTimeout: 20,
          onLog: (_jsonString, _parsed, context) => {
            receivedSignal = context.signal;
            return new Promise<void>((resolve) => {
              context.signal!.addEventListener('abort', () => {
                aborted = true;
                resolve();
              });
            });
          },
        },
        () => console.log('ship me'),
      );
      await tick(5);
      expect(receivedSignal).to.not.equal(undefined);
      expect(receivedSignal.aborted).to.equal(false);
      await tick(60);
      expect(aborted).to.equal(true);
    });

    it('does not abort a callback that finishes in time', async () => {
      let signal: any;
      capture(
        {
          onLogTimeout: 20,
          onLog: (_jsonString, _parsed, context) => {
            signal = context.signal;
          },
        },
        () => console.log('quick'),
      );
      await tick(60);
      expect(signal.aborted).to.equal(false);
    });

    it('still accepts two-argument callbacks', async () => {
      const seen: string[] = [];
      capture({ onLog: (jsonString: string) => seen.push(jsonString) }, () => console.log('two args'));
      await tick(5);
      expect(JSON.parse(seen[0]).message).to.equal('two args');
    });
  });

  describe('colorizeBackground', () => {
    afterEach(() => {
      resetBackgroundThemeCache();
    });

    // The separator color follows the background: black on light, white on dark.
    const BLACK = '\u001b[30m';
    const WHITE = '\u001b[37m';

    it('can be set as a direct option', () => {
      const [light] = captureRaw({ colorize: true, colorizeBackground: 'light' }, () => console.log('x'));
      const [dark] = captureRaw({ colorize: true, colorizeBackground: 'dark' }, () => console.log('x'));
      expect(light).to.include(BLACK);
      expect(dark).to.include(WHITE);
    });

    it('can be set through envOptions, and the direct option wins over the env var', () => {
      stubEnv('CONSOLE_LOG_COLORIZE_BACKGROUND', 'dark');
      const [fromEnvOptions] = captureRaw({ colorize: true, envOptions: { CONSOLE_LOG_COLORIZE_BACKGROUND: 'light' } }, () => console.log('x'));
      const [fromEnv] = captureRaw({ colorize: true }, () => console.log('x'));
      expect(fromEnvOptions).to.include(BLACK);
      expect(fromEnv).to.include(WHITE);
    });
  });

  describe('bundler define support', () => {
    it('reads every logger variable through a static process.env.NAME expression', () => {
      // Bundler define can only replace these static forms (see get-env.ts).
      const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'get-env.ts'), 'utf8');
      const missing = Object.values(LOGGER_ENV_VARS).filter((name) => !source.includes(`return process.env.${name};`));
      expect(missing).to.eql([]);
    });
  });

  describe('calling LoggerAdaptToConsole() more than once', () => {
    it('writes each log once and still restores the native console', () => {
      const nativeLog = console.log;
      const { originalWrite, outputText } = overrideStdOut();
      try {
        LoggerAdaptToConsole(QUIET);
        LoggerAdaptToConsole(QUIET);
        console.log('once');
      } finally {
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
      }
      expect(outputText.length).to.equal(1);
      expect(console.log).to.equal(nativeLog);
    });

    it('replaces settings instead of merging them, and resets SetLogLevel', () => {
      const { originalWrite, outputText } = overrideStdOut();
      try {
        LoggerAdaptToConsole({ ...QUIET, customOptions: { service: 'api' } });
        SetLogLevel(LOG_LEVEL.error);
        LoggerAdaptToConsole(QUIET);
        console.log('after re-init');
      } finally {
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
      }
      expect(outputText.map((line) => JSON.parse(line))).to.eql([{ level: 'info', message: 'after re-init' }]);
    });
  });
});
