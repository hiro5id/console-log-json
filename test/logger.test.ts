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

  afterEach(() => {
    sandbox.restore();
  });

  it('logs error in correct shape', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole();
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
    });

    expect(JSON.parse(outputText[1]).errCallStack.startsWith('Error: error object\n    at ')).eql(true, 'starts with specific text');

    // Ensure that the normal new lines are included at the end of the string
    expect(outputText[1].endsWith('\n\n')).eql(true);
  });

  it('does not log new line characters if configured', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole();
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
    });

    // strip last \n character because that is an artifact from stubbing out the console and not added by this library so we don't want to test for that
    outputText[1] = outputText[1].replace(/\n$/, '');

    // check our expected result, (if our system were to add a line break there would be an extra one at the end)
    expect(outputText[1]).not.includes('\n');
  });

  it('does not log new line characters if configured and regular error is thrown', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole();
    try {
      // action
      NativeConsoleLog('testing native log');
      await console.error('some string', new Error('error \r\nobject'), { age: 100 });
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
      age: 100,
    });

    // strip last \n character because that is an artifact from stubbing out the console and not added by this library so we don't want to test for that
    outputText[1] = outputText[1].replace(/\n$/, '');

    // check our expected result, (if our system were to add a line break there would be an extra one at the end)
    expect(outputText[1]).not.includes('\n');
  });

  it(`omits log call stack if configured in environment variable`, async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole();
    try {
      // action
      await console.log('some log string string');
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
    await LoggerAdaptToConsole();
    try {
      // action
      await console.log('some log string string');
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
    await LoggerAdaptToConsole();
    try {
      // action
      await console.log('some log string string');
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
    await LoggerAdaptToConsole();
    try {
      // action
      await console.log('some string', new ErrorWithContext('error \r\nobject', { 'extra-context': 'extra-context' }));
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
    await LoggerAdaptToConsole();
    try {
      // action
      await console.log(
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
      await console.error('some outer error', new ErrorWithContext(innerError, { 'extra-context': 'extra-context' }));
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
      await console.error('some outer error', new ErrorWithContext(innerError, { 'extra-context': 'extra-context' }));
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
    await LoggerAdaptToConsole({ logLevel: LOG_LEVEL.debug });

    try {
      await console.debug('this is a message', { 'extra-context': 'hello' });
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
      await console.silly('this is a message', { 'extra-context': 'hello' });
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
      await console.warn('this is a message', { 'extra-context': 'hello' });
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
      await console.log(err);
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
    await LoggerAdaptToConsole();

    const extraContext = 'this is a test string';
    const mainError = new Error('error message 2');
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new ErrorWithContext(mainError, extraContext as any);
    } catch (err) {
      await console.log(err);
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
    await LoggerAdaptToConsole();

    await console.info('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

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
    await LoggerAdaptToConsole();

    const circObject: any = { bob: 'bob' };
    circObject.circ = circObject;

    await console.log('circular reference test', circObject);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('info');
    expect(JSON.parse(outputText[0]).bob).eql('bob');
    expect(JSON.parse(outputText[0]).circ).eql('[Circular ~]');
  });

  it('Handle where a string is passed to the logger that happens to be JSON, with new lines in it', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    await LoggerAdaptToConsole();

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

    await console.log(sampleStringJson);

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

  it('console.log logs as info when explicitly provided with level:info parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log({ level: 'info' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    expect(JSON.parse(outputText[0]).level).eql('info');
  });

  it('console.log logs as error when explicitly provided with level:error parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log({ level: 'error' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
  });

  it('console.log logs as error when explicitly provided with level:err parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log({ level: 'err' }, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
  });

  it('console.log logs as warn when explicitly provided with level:warning parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log(
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
    await LoggerAdaptToConsole();

    await console.log({}, 'this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' }, {});

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

    await console.log(null, 'this is a test', null, { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });

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

    await console.log(null);

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

    await console.log();

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

    await console.error({ durationInSeconds: 1, totalErrored: 2, totalFlaggedAsSent: 4, totalPickedUp: 5, totalSent: 3 });

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

    await console.log(new Error('error-message'));

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
    await console.log(err1);

    // action 2
    const objSelf: any = { name: 'objSelf' };
    objSelf.self = objSelf;
    const err2 = new ErrorWithContext('Error2', objSelf);
    await console.log(err2);

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

    await console.error('Encountered Fatal Error on startup of public-api', {
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

    await console.log(new Error('error-message'), 'test string');

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
    await console.log('testing');

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

    await console.log(
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

  it('logging in a different order produces same result', async () => {
    // arrange
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const extraInfo1 = { firstName: 'homer', lastName: 'simpson' };
    const extraInfo2 = { age: 25, location: 'mars' };

    // action1
    await console.log(extraInfo1, 'hello world', extraInfo2);
    // action2
    await console.log('hello world', extraInfo2, extraInfo1);

    // cleanup
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // assert
    console.log(outputText[0]);
    console.log(outputText[1]);

    outputText[0] = stripTimeStamp(outputText[0]);
    outputText[1] = stripTimeStamp(outputText[1]);
    outputText[0] = stripProperty(outputText[0], '@logCallStack');
    outputText[1] = stripProperty(outputText[1], '@logCallStack');

    expect(outputText[0]).equal(outputText[1]);
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
      await console.log('this is a test', { a: 'stuff-a', b: 'stuff-b' }, 'more messages', { c: 'stuff-c' });
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

  it('filters colors', async () => {
    const messageWithColors =
      '\u001b[90m================================\u001b[39m\n \u001b[33mMissing\u001b[39m environment variables:\n    \u001b[34mCCE_MONGO_CONNECTION\u001b[39m: undefined\n\u001b[33m\u001b[39m\n\u001b[33m Exiting with error code 1\u001b[39m\n\u001b[90m================================\u001b[39m';
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log(messageWithColors);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    expect((outputText[0] as string).indexOf('\\u001b[90m') === 27).equals(false, 'the color string should not be in the output');
    expect(outputText[0]).contain(
      '"================================\\n Missing environment variables:\\n    CCE_MONGO_CONNECTION: undefined\\n\\n Exiting with error code 1\\n================================"',
    );
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
    await console.log(err1);

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
