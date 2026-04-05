/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';
import sinon from 'sinon';

describe('CONSOLE_LOG_JSON_CONTEXT_KEY', () => {
  const sandbox = sinon.createSandbox();
  process.env.CONSOLE_LOG_JSON_CONTEXT_KEY = '';
  process.env.CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR = '';
  process.env.CONSOLE_LOG_JSON_NO_FILE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_PACKAGE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';
  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS = '';
  process.env.CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE = '';
  process.env.CONSOLE_LOG_COLORIZE = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('nests context properties under the specified key', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('hello', { a: 1, b: 2 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
    expect(testObj.message).to.equal('hello');
    expect(testObj.context).to.eql({ a: 1, b: 2 });
    // Properties should NOT be at the top level
    expect(testObj.a).to.equal(undefined);
    expect(testObj.b).to.equal(undefined);
  });

  it('merges multiple objects under the context key', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('hello', { a: 1 }, { b: 2 }, { c: 3 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('hello');
    expect(testObj.context).to.eql({ a: 1, b: 2, c: 3 });
    expect(testObj.a).to.equal(undefined);
    expect(testObj.b).to.equal(undefined);
    expect(testObj.c).to.equal(undefined);
  });

  it('handles conflicting keys inside the context object', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('Hello', { a: 1 }, { a: 2 }, { a: 3 }, 'World', { a: 4 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('Hello - World');
    // Conflicting keys get underscore prefixes, but inside context
    expect(testObj.context).to.not.equal(undefined);
    expect(testObj.context.a).to.equal(1);
    expect(testObj.context._a).to.equal(2);
    expect(testObj.context.__a).to.equal(3);
    expect(testObj.context.___a).to.equal(4);
    // Nothing at the top level
    expect(testObj.a).to.equal(undefined);
    expect(testObj._a).to.equal(undefined);
  });

  it('supports custom key names', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('data');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('test', { key: 'value' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.data).to.eql({ key: 'value' });
    expect(testObj.context).to.equal(undefined);
  });

  it('preserves @filename and @packageName at top level', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('test', { userKey: 'userVal' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    // Metadata stays at top level
    expect(testObj['@filename']).to.be.a('string');
    expect(testObj['@packageName']).to.equal('console-log-json');
    // User context is nested
    expect(testObj.context.userKey).to.equal('userVal');
    expect(testObj.userKey).to.equal(undefined);
  });

  it('does not nest when context key is not set (default behavior)', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('test', { a: 1, b: 2 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    // Default: properties at top level, no context key
    expect(testObj.a).to.equal(1);
    expect(testObj.b).to.equal(2);
    expect(testObj.context).to.equal(undefined);
  });

  it('works with console.error and error objects', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.error('failed', new Error('boom'), { retryCount: 3 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
    expect(testObj.message).to.include('failed');
    expect(testObj.message).to.include('boom');
    expect(testObj.errCallStack).to.include('Error: boom');
    // User context nested under context key
    expect(testObj.context).to.not.equal(undefined);
    expect(testObj.context.retryCount).to.equal(3);
    expect(testObj.retryCount).to.equal(undefined);
  });

  it('works with console.warn', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('ctx');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.warn('low disk', { available: '2GB' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('warn');
    expect(testObj.ctx).to.eql({ available: '2GB' });
  });

  it('handles no context objects (message only)', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('just a message');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('just a message');
    // No context key when there are no context objects
    expect(testObj.context).to.equal(undefined);
  });

  it('works with customOptions (static properties stay at top level)', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_CONTEXT_KEY').value('context');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ customOptions: { service: 'my-api' } });

    try {
      await console.log('request', { path: '/api/health' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    // customOptions are also context objects, so they go under context key
    expect(testObj.context).to.not.equal(undefined);
    expect(testObj.context.path).to.equal('/api/health');
  });
});
