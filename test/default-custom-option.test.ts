/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  ErrorWithContext,
  //   FormatErrorObject,
  //   GetLogLevel,
  //   LOG_LEVEL,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  NativeConsoleLog,
  overrideStdOut,
  restoreStdOut,
  //   SetLogLevel,
} from '../src';
import sinon from 'sinon';

describe('logger with custom options', () => {
  const sandbox = sinon.createSandbox();
  // The below is needed for testing purposes only.
  // For some reason if these are not initialized sinon is unable to stub out the environment variable
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

  it('logs error in correct shape', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole({ customOptions: { hello: 'world' } });
    try {
      // action
      NativeConsoleLog('testing native log');
      await console.error('some string', new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText[0]);
    console.log(outputText[1]);
    expect(outputText[0]).equal('testing native log\n');

    const testObj = JSON.parse(stripTimeStamp(outputText[1]));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      level: 'error',
      message: 'some string  - error object',
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      'extra-context': 'extra-context',
      hello: 'world',
    });

    expect(true).to.eql(false);

    expect(JSON.parse(outputText[1]).errCallStack.startsWith('Error: error object\n    at ')).eql(true, 'starts with specific text');

    // Ensure that the normal new lines are included at the end of the string
    expect(outputText[1].endsWith('\n\n')).eql(true);
  });
});

const stripTimeStamp = (input: string): string => {
  const obj = JSON.parse(input);
  delete obj['@timestamp'];
  return JSON.stringify(obj);
};
