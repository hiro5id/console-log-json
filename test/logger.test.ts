/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
  ErrorWithContext,
  FormatErrorObject,
  GetLogLevel,
  LOG_LEVEL,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  NativeConsoleLog,
  overrideStdOut,
  restoreStdOut,
  SetLogLevel,
} from '../src';
import sinon from 'sinon';

describe('logger', () => {
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
    LoggerAdaptToConsole();
    try {
      // action
      NativeConsoleLog('testing native log');
      console.error('some string', new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    const logOutput = outputText[outputText.length - 1];
    const testObj = JSON.parse(stripTimeStamp(logOutput));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      level: 'error',
      message: 'some string  - error object',
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      'extra-context': 'extra-context',
    });

    expect(JSON.parse(logOutput).errCallStack.startsWith('Error: error object\n    at ')).eql(true, 'starts with specific text');

    // Ensure that the normal new lines are included at the end of the string
    expect(logOutput.endsWith('\n\n')).eql(true);
  });

  it('does not log new line characters if configured', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      NativeConsoleLog('testing native log');
      console.error('some string', new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    const logOutput = outputText[outputText.length - 1];
    const testObj = JSON.parse(stripTimeStamp(logOutput));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      level: 'error',
      message: 'some string  - error object',
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      'extra-context': 'extra-context',
    });

    // strip last \n character because that is an artifact from stubbing out the console and not added by this library so we don't want to test for that
    const normalizedOutput = logOutput.replace(/\n$/, '');

    // check our expected result, (if our system were to add a line break there would be an extra one at the end)
    expect(normalizedOutput).not.includes('\n');
  });

  it('does not log new line characters if configured and regular error is thrown', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      NativeConsoleLog('testing native log');
      console.error('some string', new Error('error \r\nobject'), { age: 100 });
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    const logOutput = outputText[outputText.length - 1];
    const testObj = JSON.parse(stripTimeStamp(logOutput));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      level: 'error',
      message: 'some string  - error object',
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      age: 100,
    });

    // strip last \n character because that is an artifact from stubbing out the console and not added by this library so we don't want to test for that
    const normalizedOutput = logOutput.replace(/\n$/, '');

    // check our expected result, (if our system were to add a line break there would be an extra one at the end)
    expect(normalizedOutput).not.includes('\n');
  });

  it(`omits log call stack if configured in environment variable`, async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log('some log string string');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText[0]);

    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj.errCallStack;

    expect(testObj['@logCallStack']).eql(undefined);
  });

  it(`does NOT omit log call stack if NOT configured in environment variable`, async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log('some log string string');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText[0]);

    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj.errCallStack;

    expect(testObj['@logCallStack']).not.eql(undefined);
  });

  it(`omits multiple bits if configured in environment variable`, async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');

    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log('some log string string');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText[0]);

    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj.errCallStack;

    expect(testObj['@logCallStack']).eql(undefined);
  });

  it('logs error in correct shape using console.log', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log('some string', new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }
    // assert
    console.log(outputText[0]);

    expect(JSON.parse(outputText[0]).errCallStack.startsWith('Error: error object\n    at ')).eql(true, 'starts with specific text');

    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      'extra-context': 'extra-context',
      level: 'error',
      message: 'some string  - error object',
    });
  });

  it('console.log is correctly adapted when using a combination of types', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log(
        'some string1',
        123,
        'some string2',
        { property1: 'proptery1' },
        { property2: 'property2' },
        new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }),
      );
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }
    // assert
    console.log(outputText[0]);
    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj.errCallStack;
    delete testObj['@logCallStack'];

    expect(testObj).eql({
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      'extra-context': 'extra-context',
      level: 'error',
      message: 'some string1 - 123 - some string2  - error object',
      property1: 'proptery1',
      property2: 'property2',
    });

    expect(JSON.parse(outputText[0]).errCallStack.startsWith('Error: error object\n    at')).eql(true, 'starts with specific string');
  });

  it('console.error logs the inner error', async () => {
    // arrange
    const innerError = new ErrorWithContext('this is the inner error 1234', { extraContextInner: 'blah inner context' });
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      // action
      console.error('some outer error', new ErrorWithContext(innerError, { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText[0]);
    expect(outputText[0]).contains('some outer error  - this is the inner error 1234');
  });

  it('FormatErrorObject works as expected', async () => {
    // arrange
    const innerError = new ErrorWithContext('inner error 1234', { contextInner: 'dataInner' });
    const sut = new ErrorWithContext(innerError, { contextForOuterError: 'dataOuter' });

    // action
    const formatted = FormatErrorObject(sut);

    // assert
    console.log(formatted);
    expect(formatted).contains('"contextInner":"dataInner"');
    expect(formatted).contains('"contextForOuterError":"dataOuter"');
    expect(formatted).contains('inner error 1234');
  });

  it('console.error has timestamp', async () => {
    // arrange
    const innerError = new ErrorWithContext('this is the inner error 1234', { extraContextInner: 'blah inner context' });
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      // action
      console.error('some outer error', new ErrorWithContext(innerError, { 'extra-context': 'extra-context' }));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    expect(outputText[0]).contains('"@timestamp"');
  });

  it('console.debug works', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.debug });

    try {
      console.debug('this is a message', { 'extra-context': 'hello' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('debug');
    expect(testObj.message).eql('this is a message');
    expect(testObj['extra-context']).eql('hello');
    expect(testObj['@filename']).contain('/test/logger.test');
  });

  it('console.silly works', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.silly });

    try {
      console.silly('this is a message', { 'extra-context': 'hello' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('silly');
  });

  it('console.warn works with log level info', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });

    try {
      console.warn('this is a message', { 'extra-context': 'hello' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('warn');
  });

  it('console.warn is not shown with log level error', () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.error });

    try {
      console.warn('this is a message', { 'extra-context': 'hello' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(outputText[0]).equals(undefined);
  });

  it('logs error properly when extra context is a string', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const extraContext = 'this is a test string';
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new ErrorWithContext(`error message 1`, extraContext as any);
    } catch (err) {
      console.log(err);
    }
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj.message).eql('  - error message 1 - this is a test string');
    expect(testObj.errCallStack.startsWith('Error: error message 1 - this is a test string\n    at')).eql(true, 'stack starts with specific message');
  });

  it('logs error properly when extra context is a string and main error is an error object', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const extraContext = 'this is a test string';
    const mainError = new Error('error message 2');
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new ErrorWithContext(mainError, extraContext as any);
    } catch (err) {
      console.log(err);
    }
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj1 = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj1['@filename'];
    delete testObj1.errCallStack;
    delete testObj1['@logCallStack'];
    expect(testObj1).eql({
      '@errorObjectName': 'Error',
      '@packageName': 'console-log-json',
      level: 'error',
      message: '  - error message 2 - this is a test string',
    });

    const testObj2 = JSON.parse(outputText[0]);
    expect(testObj2['@filename']).include('/test/logger.test');
    expect(testObj2.errCallStack.startsWith('Error: error message 2 - this is a test string\n    at')).eql(true, 'stack starts with specific text');
  });

  it('console.info works', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.info('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);

    outputText[0] = stripProperty(outputText[0], '@logCallStack');
    outputText[0] = stripTimeStamp(outputText[0]);

    expect(JSON.parse(outputText[0])['@filename']).contains('/test/logger.test');

    outputText[0] = stripProperty(outputText[0], '@filename');

    expect(JSON.parse(outputText[0])).eql({
      '@packageName': 'console-log-json',
      a: 'stuff-a',
      b: 'stuff-b',
      c: 'stuff-c',
      level: 'info',
      message: 'this is a test - more messages',
    });
  });

  it('handles object with circular reference', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const circObject: any = { bob: 'bob' };
    circObject.circ = circObject;

    console.log('circular reference test', circObject);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('info');
    expect(JSON.parse(outputText[0]).bob).eql('bob');
    expect(JSON.parse(outputText[0]).circ).eql('[Circular ~]');
  });

  it('Handle where a string is passed to the logger that happens to be JSON, with new lines in it', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const circObject: any = { bob: 'bob' };
    circObject.circ = circObject;

    const sampleStringJson = `
        {
  "attachments": [
    {
      "color": "#0062FF",
      "fields": [
        {
          "title": "# of SDs for READY state update",
          "value": "56"
        },
        {
          "title": "PDF_VERIFIED => READY",
          "value": "56"
        }
      ],
      "author_name": "DSP Conversion Runner"
    },
    {
      "color": "#DA1E28",
      "fields": [
        {
          "title": "# of SDs failed to update state",
          "value": "0"
        }
      ],
      "author_name": "DSP Conversion Runner"
    }
  ]
}  
     `;

    console.log(sampleStringJson);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);

    expect(JSON.parse(outputText[0]).level).eql('info');
    expect(JSON.parse(outputText[0])['@autoParsedJson']).eql({
      attachments: [
        {
          color: '#0062FF',
          fields: [
            { title: '# of SDs for READY state update', value: '56' },
            { title: 'PDF_VERIFIED => READY', value: '56' },
          ],
          author_name: 'DSP Conversion Runner',
        },
        { color: '#DA1E28', fields: [{ title: '# of SDs failed to update state', value: '0' }], author_name: 'DSP Conversion Runner' },
      ],
    });
  });

  it('If the CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE definition is enabled, the automatic JSON parser will not run.', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const circObject: any = { bob: 'bob' };
    circObject.circ = circObject;

    const sampleStringJson = `
    {
      "attachments": [
        {
          "color": "#0062FF",
          "fields": [
            {
              "title": "# of SDs for READY state update",
              "value": "56"
            },
            {
              "title": "PDF_VERIFIED => READY",
              "value": "56"
            }
          ],
          "author_name": "DSP Conversion Runner"
        },
        {
          "color": "#DA1E28",
          "fields": [
            {
              "title": "# of SDs failed to update state",
              "value": "0"
            }
          ],
          "author_name": "DSP Conversion Runner"
        }
      ]
    }
`;

    console.log(sampleStringJson);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);

    expect(JSON.parse(outputText[0]).level).eql('info');
    expect(typeof JSON.parse(outputText[0]) === 'object').eql(true);
    expect(JSON.parse(outputText[0])['@autoParsedJson']).eql(undefined);
  });

  it('console.log logs as info when explicitly provided with level:info parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({ level: 'info' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('info');
  });

  it('console.log logs as error when explicitly provided with level:error parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({ level: 'error' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
  });

  it('console.log logs as error when explicitly provided with level:err parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({ level: 'err' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
  });

  it('console.log logs as warn when explicitly provided with level:warning parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(
      { level: 'warning' },
      'this is a test',
      {
        a: 'stuff-a',
        b: 'stuff-b',
      },
      'more messages',
      { c: 'stuff-c' },
    );

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('warn');
  });

  it('handle empty object', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({}, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' }, {});

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(stripTimeStamp(outputText[0]));
    delete testObj['@filename'];
    delete testObj['@logCallStack'];
    expect(testObj).eql({
      '@packageName': 'console-log-json',
      a: 'stuff-a',
      b: 'stuff-b',
      c: 'stuff-c',
      level: 'info',
      message: 'this is a test - more messages',
    });
  });

  it('ignore null parameters among other parameters', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(null, 'this is a test', null, { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).eql('this is a test - more messages');
    expect(testObj.a).eql('stuff-a');
    expect(testObj.b).eql('stuff-b');
    expect(testObj.c).eql('stuff-c');
    expect(testObj['@filename']).include('/test/logger.test');
  });

  it('handle when only null parameter is provided', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(null);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('<value-passed-to-console-log-json-was-null>');
  });

  it('handle when nothing is provided', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log();

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('<nothing-was-passed-to-console-log>');
  });

  it('no error message was passed, it displays informative message in log', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.error({ durationInSeconds: 1, totalErrored: 2, totalFlaggedAsSent: 4, totalPickedUp: 5, totalSent: 3 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('<no-error-message-was-passed-to-console-log>');
  });

  it('no message passed to console log but other values are passed', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const blahUrl = 'http://no.where.com';
    console.log({ where: 'app' }, { blahUrl });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('<no-message-was-passed-to-console-log>');
  });

  it('no error message passed to console log but other values are passed', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const blahUrl = 'http://no.where.com';
    console.error({ where: 'app' }, { blahUrl });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('<no-error-message-was-passed-to-console-log>');
  });

  it('handle single error object with message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(new Error('error-message'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('  - error-message');
  });

  it('log works with self referencing properties', async () => {
    // arrange
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    // action 1
    const err1 = new Error('Error1');
    (err1 as any).self = err1;
    console.log(err1);

    // action 2
    const objSelf: any = { name: 'objSelf' };
    objSelf.self = objSelf;
    const err2 = new ErrorWithContext('Error2', objSelf);
    console.log(err2);

    // cleanup
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // assert
    outputText.forEach((l) => {
      console.log(l);
    });
    const testObj = JSON.parse(outputText[1]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('  - Error2');
    expect(testObj.self.self).eql(undefined);
  });

  it('handle scenario where non traditional error object is passed', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.error('Encountered Fatal Error on startup of public-api', {
      name: 'MongoTimeoutError',
      stack:
        'MongoTimeoutError: Server selection timed out after 30000 ms\n    at Timeout._onTimeout (/Users/roberto/dev/cnp/web/public-api/node_modules/mongodb/lib/core/sdam/server_selection.js:308:9)\n    at listOnTimeout (internal/timers.js:531:17)\n    at processTimers (internal/timers.js:475:7)',
      message: 'Server selection timed out after 30000 ms',
    });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('Encountered Fatal Error on startup of public-api  - Server selection timed out after 30000 ms');
    expect(testObj['@errorObjectName']).eql('MongoTimeoutError');
  });

  it('log with debug shows debug line', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ debugString: true });

    console.log(new Error('error-message'), 'test string');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('test string  - error-message');
    expect(testObj._loggerDebug).contains('"test string"');
    expect(testObj._loggerDebug[0]).contains('"stack":"Error: error-message');
  });

  it('error during processing of debug line shows the error', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ debugString: true });
    (console as any).debugStringException = () => {
      throw new Error('error while building debugString');
    };
    console.log('testing');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();
    delete (console as any).debugStringException;

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('testing');
    expect(testObj._loggerDebug).eql('err error while building debugString');
  });

  it('console.log logs as info when explicitly provided with level parameter that is not recognized', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(
      { level: 'somethingElse' },
      'this is a test',
      {
        a: 'stuff-a',
        b: 'stuff-b',
      },
      'more messages',
      { c: 'stuff-c' },
    );

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).eql('this is a test - more messages');
    expect(testObj.a).eql('stuff-a');
    expect(testObj.b).eql('stuff-b');
    expect(testObj.c).eql('stuff-c');
    expect(testObj['@filename']).include('/test/logger.test');
  });

  it('logging permutations of message, error, contexts, and explicit level produce the same normalized result', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const permutations = [
      ['message', 'error', 'context1', 'context2', 'level'],
      ['level', 'context2', 'message', 'context1', 'error'],
      ['context1', 'error', 'level', 'context2', 'message'],
      ['context2', 'message', 'level', 'error', 'context1'],
      ['error', 'context1', 'message', 'level', 'context2'],
      ['context1', 'context2', 'level', 'message', 'error'],
    ];

    const createArgumentByKind = (kind: string) => {
      if (kind === 'message') {
        return 'hello world';
      }
      if (kind === 'error') {
        return new Error('permuted failure');
      }
      if (kind === 'context1') {
        return { firstName: 'homer', lastName: 'simpson' };
      }
      if (kind === 'context2') {
        return { age: 25, location: 'mars' };
      }
      if (kind === 'level') {
        return { level: 'warn' };
      }
      throw new Error(`unknown permutation kind ${kind}`);
    };

    try {
      for (const permutation of permutations) {
        const args = permutation.map(createArgumentByKind);
        console.log(...args);
      }
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const normalizedLogs = outputText.map(normalizeStableLogObject);

    normalizedLogs.forEach((log) => {
      expect(log).to.eql({
        '@errorObjectName': 'Error',
        '@packageName': 'console-log-json',
        age: 25,
        firstName: 'homer',
        lastName: 'simpson',
        level: 'error',
        location: 'mars',
        message: 'hello world  - permuted failure',
      });
    });

    const baseline = normalizedLogs[0];
    normalizedLogs.slice(1).forEach((log) => {
      expect(log).to.eql(baseline);
    });
  });

  it('console.log exception but is handled without crashing out', async () => {
    // arrange
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole();
    (console as any).exception = () => {
      throw new Error('this is a test');
    };
    let caughtErr = null;

    // action
    try {
      console.log('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });
    } catch (err) {
      caughtErr = err;
    }

    // reset
    delete (console as any).exception;
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // assert
    expect(caughtErr).equal(null);
  });

  it('throws an error with additional context', () => {
    const baseErr = Error('a random error');
    const errWithContext = new ErrorWithContext(baseErr, { additional: 'context' });

    expect(errWithContext.message).to.eql('a random error');
    expect((errWithContext as any).extraContext.additional).to.eql('context');
  });

  it('handle string as extraContext', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const err1 = {
      stack:
        'Error: Error while querying DB2 database\n    at Db2QueryService.<anonymous> (/app/src/shared/Db2QueryService.ts:14:13)\n    at Generator.throw (<anonymous>)\n    at rejected (/app/dist/packages/internal-api/src/shared/Db2QueryService.js:6:65)',
      message: 'Error while querying DB2 database',
      extraContext: 'Timed out in 20000ms.',
    };
    console.log(err1);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    outputText.forEach((l) => {
      console.log(l);
    });
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
    expect(testObj['@filename']).include('/test/logger.test');
    expect(testObj.message).eql('  - Timed out in 20000ms. - Error while querying DB2 database');
  });

  it('extra context object is not flattened when nested', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('not flattened', { obj: { subObj1: 'subObj1', subObj2: 'subObj2' } });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.obj).eql({ subObj1: 'subObj1', subObj2: 'subObj2' });
  });

  it('concatenates string and numbers', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('string merged', 400);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).eql('string merged - 400');
  });

  it('concatenates string and error object', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('string merged ' + new Error('this is inside the error'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).eql('string merged Error: this is inside the error');
  });

  it('color console.log logs as error when explicitly provided with level:err parameter', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_COLORIZE').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log({ level: 'err' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 1234 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    
    // const testObj = JSON.parse(outputText[0]);
    expect(outputText[0].startsWith("\u001b[30m{\u001b[0m\u001b[38;2;26;175;192m\"level\":\u001b[30m\u001b[0m\u001b[31m\"error\"\u001b[30m,\u001b[0m\u001b[38;2;36;119;36m\"message\":\u001b[30m\u001b[0m\u001b[31m\"this is a test - more messages\"\u001b[30m,\u001b[0m\u001b[38;2;159;147;45m\"@filename\":\u001b[30m\u001b[0m\u001b[33m\"")).eql(true);
  });


  it('color console.log logs as normal', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_COLORIZE').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    console.log('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 1234 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    
    // const testObj = JSON.parse(outputText[0]);
    expect(outputText[0].startsWith("\u001b[30m{\u001b[0m\u001b[38;2;26;175;192m\"level\":\u001b[30m\u001b[0m\u001b[38;2;31;230;255m\"info\"\u001b[30m,\u001b[0m\u001b[38;2;36;119;36m\"message\":\u001b[30m\u001b[0m\u001b[38;2;0;255;127m\"this is a test - more messages\"\u001b[30m,\u001b[0m\u001b[38;2;159;147;45m\"@filename\":\u001b[30m\u001b[0m\u001b[33m\"")).eql(true);
  });  

  it('color console.log logs with error object', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_COLORIZE').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const err = new Error("HEY MAN THIS IS AN ERROR!");
    console.log('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', err,{ c: 1234 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    
    // const testObj = JSON.parse(outputText[0]);
    expect(outputText[0].startsWith("\u001b[30m{\u001b[0m\u001b[38;2;26;175;192m\"level\":\u001b[30m\u001b[0m\u001b[31m\"error\"\u001b[30m,\u001b[0m\u001b[38;2;36;119;36m\"message\":\u001b[30m\u001b[0m\u001b[31m\"this is a test - more messages  - HEY MAN THIS IS AN ERROR!\"\u001b[30m,\u001b[0m\u001b[38;2;135;38;162m\"@errorObjectName\":\u001b[30m\u001b[0m\u001b[37m\"Error\"\u001b[30m,\u001b[0m\u001b[38;2;159;147;45m\"@filename\":\u001b[30m\u001b[0m\u001b[33m\"")).eql(true);
  });    

  // Todo: test multiple nested ErrorWithContext objects to ensure proper stacktrace and error messages
});

const stripTimeStamp = (input: string): string => {
  const obj = JSON.parse(input);
  delete obj['@timestamp'];
  return JSON.stringify(obj);
};

const stripProperty = (input: string, propertyName: string): string => {
  const obj = JSON.parse(input);
  delete obj[propertyName];
  return JSON.stringify(obj);
};

const normalizeStableLogObject = (input: string): any => {
  const obj = JSON.parse(input);
  delete obj['@timestamp'];
  delete obj['@filename'];
  delete obj['@logCallStack'];
  delete obj.errCallStack;
  return obj;
};
