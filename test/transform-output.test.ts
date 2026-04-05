/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';

describe('transformOutput', () => {
  it('modifies the log output', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        obj.custom = 'injected';
        return obj;
      },
    });

    try {
      await console.log('transformed');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('transformed');
    expect(testObj.custom).to.equal('injected');
  });

  it('can remove fields from the output', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        delete obj.level;
        return obj;
      },
    });

    try {
      await console.log('no level');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal(undefined);
    expect(testObj.message).to.equal('no level');
  });

  it('can rename fields', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        obj.severity = obj.level;
        obj.msg = obj.message;
        delete obj.level;
        delete obj.message;
        return obj;
      },
    });

    try {
      await console.log('renamed fields');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.severity).to.equal('info');
    expect(testObj.msg).to.equal('renamed fields');
    expect(testObj.level).to.equal(undefined);
    expect(testObj.message).to.equal(undefined);
  });

  it('can return a completely new object', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        return { severity: obj.level, text: obj.message, source: 'custom' };
      },
    });

    try {
      await console.log('replaced');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj).to.eql({ severity: 'info', text: 'replaced', source: 'custom' });
  });

  it('falls back to original output when transform throws', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: () => {
        throw new Error('transform broke');
      },
    });

    try {
      await console.log('should survive');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // Original output should be used as fallback
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
    expect(testObj.message).to.equal('should survive');
  });

  it('falls back to original output when transform returns null', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: () => {
        return null;
      },
    });

    try {
      await console.log('null return');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('null return');
  });

  it('falls back to original output when transform returns a string', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: () => {
        return 'not an object';
      },
    });

    try {
      await console.log('string return');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // Should fall back to original since return wasn't an object
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('string return');
  });

  it('works with error objects', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
      },
      transformOutput: (obj) => {
        obj.environment = 'production';
        return obj;
      },
    });

    try {
      await console.log('error test', new Error('boom'));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
    expect(testObj.environment).to.equal('production');
    expect(testObj.errCallStack).to.include('boom');
  });

  it('works together with onLog (transform runs first, onLog gets transformed data)', async () => {
    const intercepted: any[] = [];
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({
      envOptions: {
        CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
        CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
        CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
      },
      transformOutput: (obj) => {
        obj.transformed = true;
        return obj;
      },
      onLog: (_jsonString, parsedObject) => {
        intercepted.push(parsedObject);
      },
    });

    try {
      await console.log('both hooks');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // Output should have the transform applied
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.transformed).to.equal(true);

    // Wait for async onLog
    await new Promise((resolve) => setTimeout(resolve, 50));
    // onLog should receive the transformed output
    expect(intercepted[0].transformed).to.equal(true);
  });

  it('no transformOutput preserves default behavior', async () => {
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
      await console.log('default');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj).to.eql({ level: 'info', message: 'default' });
  });
});
