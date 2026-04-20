/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  overrideStdOut,
  restoreStdOut,
} from '../src';

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');

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
      console.log('transformed');
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
      console.log('no level');
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
      console.log('renamed fields');
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
      console.log('replaced');
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
      console.log('should survive');
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
      console.log('null return');
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
      console.log('string return');
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
      console.log('error test', new Error('boom'));
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
      console.log('both hooks');
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
      console.log('default');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj).to.eql({ level: 'info', message: 'default' });
  });

  it('preserves transformed JSON semantics when colorize is enabled', async () => {
    const savedEnv = {
      FORCE_NO_COLOR: process.env.FORCE_NO_COLOR,
      FORCE_COLOR: process.env.FORCE_COLOR,
      DYNO: process.env.DYNO,
    };
    process.env.FORCE_NO_COLOR = '';
    process.env.FORCE_COLOR = 'true';
    process.env.DYNO = '';

    const { originalWrite, outputText } = overrideStdOut();

    try {
      LoggerAdaptToConsole({
        colorize: true,
        noTimeStamp: true,
        noFileName: true,
        noPackageName: true,
        noStackForNonError: true,
        transformOutput: (obj) => {
          obj.custom = 'injected';
          obj.severity = obj.level;
          return obj;
        },
      });
      console.log('transformed with color', { count: 42 });
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
    expect(testObj).to.eql({
      level: 'info',
      message: 'transformed with color',
      count: 42,
      custom: 'injected',
      severity: 'info',
    });
  });
});
