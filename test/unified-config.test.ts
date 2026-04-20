/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LOG_LEVEL,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';

const CONFIG_ENV_KEYS = [
  'CONSOLE_LOG_JSON_LOG_LEVEL',
  'CONSOLE_LOG_JSON_DEBUG_STRING',
  'CONSOLE_LOG_JSON_CUSTOM_OPTIONS',
  'CONSOLE_LOG_JSON_ON_LOG',
  'CONSOLE_LOG_JSON_ON_LOG_TIMEOUT',
  'CONSOLE_LOG_JSON_TRANSFORM_OUTPUT',
  'CONSOLE_LOG_JSON_REDACT',
  'CONSOLE_LOG_JSON_NO_TIME_STAMP',
  'CONSOLE_LOG_JSON_NO_FILE_NAME',
  'CONSOLE_LOG_JSON_NO_PACKAGE_NAME',
  'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR',
] as const;

describe('unified configuration surface', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const globalHookPath = '__consoleLogJsonEnvHooks';

  beforeEach(() => {
    for (const key of CONFIG_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    delete (globalThis as any)[globalHookPath];
  });

  afterEach(() => {
    for (const key of CONFIG_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    delete (globalThis as any)[globalHookPath];
    LoggerRestoreConsole();
  });

  it('supports top-level aliases for the env-backed formatting flags', async () => {
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.log('minimal');
    } finally {
      restoreStdOut(originalWrite);
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj).to.eql({ level: 'info', message: 'minimal' });
  });

  it('CONSOLE_LOG_JSON_LOG_LEVEL configures the runtime log level', async () => {
    process.env.CONSOLE_LOG_JSON_LOG_LEVEL = 'warn';
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.info('hidden');
      console.warn('shown');
    } finally {
      restoreStdOut(originalWrite);
    }

    expect(outputText.length).to.equal(1);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('warn');
    expect(testObj.message).to.equal('shown');
  });

  it('CONSOLE_LOG_JSON_DEBUG_STRING enables _loggerDebug output', async () => {
    process.env.CONSOLE_LOG_JSON_DEBUG_STRING = 'true';
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.log('debug output');
    } finally {
      restoreStdOut(originalWrite);
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj._loggerDebug).to.not.equal(undefined);
  });

  it('CONSOLE_LOG_JSON_CUSTOM_OPTIONS injects static properties from JSON', async () => {
    process.env.CONSOLE_LOG_JSON_CUSTOM_OPTIONS = '{"service":"billing-api","region":"ca-central-1"}';
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.log('with env custom options');
    } finally {
      restoreStdOut(originalWrite);
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.service).to.equal('billing-api');
    expect(testObj.region).to.equal('ca-central-1');
  });

  it('CONSOLE_LOG_JSON_REDACT accepts JSON configuration', async () => {
    process.env.CONSOLE_LOG_JSON_REDACT = '["token"]';
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.log('redact env', { token: 'secret', keep: 'ok' });
    } finally {
      restoreStdOut(originalWrite);
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.token).to.equal('Redacted');
    expect(testObj.keep).to.equal('ok');
  });

  it('CONSOLE_LOG_JSON_TRANSFORM_OUTPUT resolves a global function path', async () => {
    (globalThis as any)[globalHookPath] = {
      transformOutput: (obj: any) => {
        obj.transformedByEnv = true;
        return obj;
      },
    };
    process.env.CONSOLE_LOG_JSON_TRANSFORM_OUTPUT = `${globalHookPath}.transformOutput`;

    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.log('transform env');
    } finally {
      restoreStdOut(originalWrite);
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.transformedByEnv).to.equal(true);
  });

  it('CONSOLE_LOG_JSON_ON_LOG resolves a global function path and honors CONSOLE_LOG_JSON_ON_LOG_TIMEOUT', (done) => {
    const capturedTimeouts: number[] = [];
    const originalSetTimeout = global.setTimeout;

    (globalThis as any)[globalHookPath] = {
      onLog: (_jsonString: string, parsedObject: any) => {
        try {
          expect(parsedObject.message).to.equal('intercepted from env');
          expect(capturedTimeouts).to.include(17);
          done();
        } catch (err) {
          done(err);
        } finally {
          global.setTimeout = originalSetTimeout;
        }
      },
    };

    process.env.CONSOLE_LOG_JSON_ON_LOG = `${globalHookPath}.onLog`;
    process.env.CONSOLE_LOG_JSON_ON_LOG_TIMEOUT = '17';

    global.setTimeout = (((handler: any, timeout?: any, ...args: any[]) => {
      capturedTimeouts.push(timeout as number);
      return (originalSetTimeout as any)(handler, timeout, ...args);
    }) as unknown) as typeof setTimeout;

    const { originalWrite } = overrideStdOut();

    LoggerAdaptToConsole({
      noTimeStamp: true,
      noFileName: true,
      noPackageName: true,
      noStackForNonError: true,
    });

    console.log('intercepted from env');

    restoreStdOut(originalWrite);
  });

  it('direct LoggerAdaptToConsole options override environment variables', async () => {
    process.env.CONSOLE_LOG_JSON_LOG_LEVEL = 'error';
    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        logLevel: LOG_LEVEL.info,
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
      });
      console.info('visible');
    } finally {
      restoreStdOut(originalWrite);
    }

    expect(outputText.length).to.equal(1);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('visible');
  });
});
