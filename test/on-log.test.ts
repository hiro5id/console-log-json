/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';

describe('onLog interceptor', () => {
  it('receives the formatted JSON string and parsed object', (done) => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      onLog: (jsonString, parsedObject) => {
        try {
          expect(jsonString).to.be.a('string');
          expect(JSON.parse(jsonString)).to.eql(parsedObject);
          expect(parsedObject.level).to.equal('info');
          expect(parsedObject.message).to.equal('intercepted');
          done();
        } catch (err) {
          done(err);
        } finally {
          restoreStdOut(originalWrite);
          LoggerRestoreConsole();
        }
      },
    });

    console.log('intercepted');
  });

  it('does not affect normal log output', async () => {
    const intercepted: any[] = [];
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      onLog: (_jsonString, parsedObject) => {
        intercepted.push(parsedObject);
      },
    });

    console.log('normal output');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // Normal output still appears
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('normal output');

    // Wait for async interceptor
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(intercepted.length).to.equal(1);
    expect(intercepted[0].message).to.equal('normal output');
  });

  it('interceptor errors do not crash the logger or the application', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      onLog: () => {
        throw new Error('interceptor exploded');
      },
    });

    // Should not throw
    console.log('should not crash');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // Normal output still appears despite interceptor throwing
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('should not crash');
  });

  it('interceptor receives error-level logs with errCallStack', (done) => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true' },
      onLog: (_jsonString, parsedObject) => {
        try {
          expect(parsedObject.level).to.equal('error');
          expect(parsedObject.message).to.include('db failed');
          expect(parsedObject.errCallStack).to.be.a('string');
          done();
        } catch (err) {
          done(err);
        } finally {
          restoreStdOut(originalWrite);
          LoggerRestoreConsole();
        }
      },
    });

    console.log('db failed', new Error('connection timeout'));
  });

  it('interceptor receives context properties', (done) => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      onLog: (_jsonString, parsedObject) => {
        try {
          expect(parsedObject.userId).to.equal(42);
          expect(parsedObject.action).to.equal('login');
          done();
        } catch (err) {
          done(err);
        } finally {
          restoreStdOut(originalWrite);
          LoggerRestoreConsole();
        }
      },
    });

    console.log('user event', { userId: 42, action: 'login' });
  });

  it('interceptor receives customOptions', (done) => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({
      customOptions: { service: 'my-api' },
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      onLog: (_jsonString, parsedObject) => {
        try {
          expect(parsedObject.service).to.equal('my-api');
          done();
        } catch (err) {
          done(err);
        } finally {
          restoreStdOut(originalWrite);
          LoggerRestoreConsole();
        }
      },
    });

    console.log('with service');
  });

  it('interceptor is called for each log call', async () => {
    const intercepted: any[] = [];
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      onLog: (_jsonString, parsedObject) => {
        intercepted.push(parsedObject.message);
      },
    });

    console.log('first');
    console.log('second');
    console.log('third');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // Wait for async interceptors
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(intercepted).to.eql(['first', 'second', 'third']);
  });

  it('no onLog callback means no interception (default behavior)', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('no interceptor');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('no interceptor');
  });

  it('async interceptor does not block logging', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      onLog: async () => {
        // Simulate slow async work
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    });

    const start = Date.now();
    console.log('should be fast');
    const elapsed = Date.now() - start;

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // The log call should return nearly instantly, not wait 100ms
    expect(elapsed).to.be.lessThan(50);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('should be fast');
  });
});
