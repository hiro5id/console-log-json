/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';

describe('envOptions (programmatic configuration)', () => {
  it('CONSOLE_LOG_JSON_NO_TIME_STAMP via envOptions', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true' },
    });

    try {
      await console.log('no timestamp');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@timestamp']).to.equal(undefined);
    expect(testObj.message).to.equal('no timestamp');
  });

  it('CONSOLE_LOG_JSON_NO_FILE_NAME via envOptions', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_FILE_NAME: 'true' },
    });

    try {
      await console.log('no filename');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@filename']).to.equal(undefined);
  });

  it('CONSOLE_LOG_JSON_NO_PACKAGE_NAME via envOptions', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true' },
    });

    try {
      await console.log('no package');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@packageName']).to.equal(undefined);
  });

  it('CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR via envOptions', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true' },
    });

    try {
      await console.log('no stack');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@logCallStack']).to.equal(undefined);
  });

  it('CONSOLE_LOG_JSON_CONTEXT_KEY via envOptions', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_CONTEXT_KEY: 'data',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
      },
    });

    try {
      await console.log('nested', { key: 'value' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.data).to.eql({ key: 'value' });
    expect(testObj.key).to.equal(undefined);
  });

  it('multiple envOptions at once', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
    });

    try {
      await console.log('minimal');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj).to.eql({ level: 'info', message: 'minimal' });
  });

  it('envOptions override environment variables', async () => {
    // Set env var to NOT suppress timestamp
    process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';
    const { originalWrite, outputText } = overrideStdOut();
    // But programmatically suppress it
    LoggerAdaptToConsole({
      envOptions: { CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true' },
    });

    try {
      await console.log('override test');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@timestamp']).to.equal(undefined);
  });

  it('envOptions works with customOptions together', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      customOptions: { service: 'my-app' },
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
    });

    try {
      await console.log('combined', { action: 'test' });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
    expect(testObj.message).to.equal('combined');
    expect(testObj.service).to.equal('my-app');
    expect(testObj.action).to.equal('test');
    expect(testObj['@timestamp']).to.equal(undefined);
    expect(testObj['@filename']).to.equal(undefined);
  });

  it('no envOptions preserves default behavior', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('default');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@timestamp']).to.be.a('string');
    expect(testObj['@filename']).to.be.a('string');
    expect(testObj['@packageName']).to.equal('console-log-json');
  });
});
