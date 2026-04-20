/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import { LoggerAdaptToConsole, LoggerRestoreConsole, overrideStdOut, restoreStdOut } from '../src';

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');

describe('redaction', () => {
  it('redacts configured structured fields without mutating the caller input', () => {
    const { originalWrite, outputText } = overrideStdOut();
    const context = {
      user: { password: 'super-secret', role: 'admin' },
      headers: { 'x-api-key': 'abc-123', traceId: 'trace-1' },
      items: [{ token: 'one', keep: 'a' }, { token: 'two', keep: 'b' }],
    };

    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      redact: ['user.password', 'headers["x-api-key"]', 'items[*].token'],
    });

    try {
      console.log('login', context);
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.user.password).to.equal('Redacted');
    expect(testObj.user.role).to.equal('admin');
    expect(testObj.headers['x-api-key']).to.equal('Redacted');
    expect(testObj.headers.traceId).to.equal('trace-1');
    expect(testObj.items[0].token).to.equal('Redacted');
    expect(testObj.items[1].token).to.equal('Redacted');
    expect(testObj.items[0].keep).to.equal('a');
    expect(testObj.message).to.equal('login');

    expect(context.user.password).to.equal('super-secret');
    expect(context.headers['x-api-key']).to.equal('abc-123');
    expect(context.items[0].token).to.equal('one');
  });

  it('supports the object form with a custom censor value', () => {
    const { originalWrite, outputText } = overrideStdOut();

    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      redact: {
        paths: ['auth.token'],
        censor: 'MASKED',
      },
    });

    try {
      console.log('custom censor', { auth: { token: 'secret-token', type: 'bearer' } });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.auth.token).to.equal('MASKED');
    expect(testObj.auth.type).to.equal('bearer');
  });

  it('runs redaction after transformOutput and before onLog', (done) => {
    const { originalWrite, outputText } = overrideStdOut();

    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        obj.session = { secret: 'session-secret', keep: 'ok' };
        return obj;
      },
      redact: ['session.secret'],
      onLog: (jsonString, parsedObject) => {
        try {
          expect(parsedObject.session.secret).to.equal('Redacted');
          expect(parsedObject.session.keep).to.equal('ok');
          expect(JSON.parse(jsonString)).to.eql(parsedObject);

          const written = JSON.parse(outputText[0]);
          expect(written.session.secret).to.equal('Redacted');
          done();
        } catch (err) {
          done(err);
        } finally {
          restoreStdOut(originalWrite);
          LoggerRestoreConsole();
        }
      },
    });

    console.log('transform then redact');
  });

  it('ignores invalid redact paths instead of breaking logging', () => {
    const { originalWrite, outputText } = overrideStdOut();

    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      redact: ['user[', 'token'],
    });

    try {
      console.log('still logs', { token: 'secret-value' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('still logs');
    expect(testObj.token).to.equal('Redacted');
  });

  it('preserves redacted JSON semantics when colorize is enabled', () => {
    const savedEnv = {
      FORCE_NO_COLOR: process.env.FORCE_NO_COLOR,
      FORCE_COLOR: process.env.FORCE_COLOR,
      DYNO: process.env.DYNO,
    };
    process.env.FORCE_NO_COLOR = '';
    process.env.FORCE_COLOR = 'true';
    process.env.DYNO = '';

    const { originalWrite, outputText } = overrideStdOut();
    const context = {
      auth: { token: 'secret-token', type: 'bearer' },
      nested: { keep: 'visible' },
    };

    try {
      LoggerAdaptToConsole({
        colorize: true,
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
        redact: ['auth.token'],
      });
      console.log('redacted with color', context);
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();

      if (savedEnv.FORCE_NO_COLOR === undefined) {
        delete process.env.FORCE_NO_COLOR;
      } else {
        process.env.FORCE_NO_COLOR = savedEnv.FORCE_NO_COLOR;
      }

      if (savedEnv.FORCE_COLOR === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = savedEnv.FORCE_COLOR;
      }

      if (savedEnv.DYNO === undefined) {
        delete process.env.DYNO;
      } else {
        process.env.DYNO = savedEnv.DYNO;
      }
    }

    expect(outputText[0]).to.include('\x1b[');

    const testObj = JSON.parse(stripAnsi(outputText[0]));
    expect(testObj.message).to.equal('redacted with color');
    expect(testObj.auth.token).to.equal('Redacted');
    expect(testObj.auth.type).to.equal('bearer');
    expect(testObj.nested.keep).to.equal('visible');
    expect(context.auth.token).to.equal('secret-token');
  });
});
