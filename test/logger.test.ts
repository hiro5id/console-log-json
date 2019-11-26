import {expect} from 'chai';
import {
  ErrorWithContext,
  FormatErrorObject, GetLogLevel,
  LOG_LEVEL,
  LoggerAdaptToConsole,
  LoggerRestoreConsole, overrideStdOut, restoreStdOut, SetLogLevel
} from '../src';

describe('logger', () => {
  it('logs error in correct shape', () => {
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.error('some string', new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    console.log(outputText);
    expect(outputText[0]).contains(
        '{"level":"error","message":"some string - error object","extra-context":"extra-context","stack":"Error: error object    at',
    );
  });

  it('logs error in correct shape using console.log', () => {
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log('some string', new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }
    // assert
    expect(outputText[0]).contains(
        '{"level":"error","message":"some string - error object","extra-context":"extra-context","stack":"Error: error object    at',
    );
  });

  it('console.log is correctly adapted when using a combination of types', () => {
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();
    try {
      // action
      console.log(
          'some string1',
          123,
          'some string2',
          {property1: 'proptery1'},
          {property2: 'property2'},
          new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}),
      );
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }
    // assert
    console.log(outputText);
    expect(outputText[0]).includes(
        '{"level":"error","message":"some string1 - 123 - some string2 - error object","extra-context":"extra-context","property1":"proptery1","property2":"property2","stack":"Error: error object    at',
    );
  });


  it('console.error logs the inner error', () => {
    // arrange
    const innerError = new ErrorWithContext('this is the inner error 1234', {extraContextInner: 'blah inner context'});
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      // action
      console.error('some outer error', new ErrorWithContext(innerError, {'extra-context': 'extra-context'}));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    expect(outputText[0]).contains('some outer error - this is the inner error 1234');
  });

  it('FormatErrorObject works as expected', () => {
    // arrange
    const innerError = new ErrorWithContext('inner error 1234', {contextInner: 'dataInner'});
    const sut = new ErrorWithContext(innerError, {contextForOuterError: 'dataOuter'});

    // action
    const formatted = FormatErrorObject(sut);

    // assert
    expect(formatted).contains('"contextInner":"dataInner"');
    expect(formatted).contains('"contextForOuterError":"dataOuter"');
    expect(formatted).contains('inner error 1234');
  });

  it('console.error has timestamp', () => {
    // arrange
    const innerError = new ErrorWithContext('this is the inner error 1234', {extraContextInner: 'blah inner context'});
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      // action
      console.error('some outer error', new ErrorWithContext(innerError, {'extra-context': 'extra-context'}));
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // assert
    expect(outputText[0]).contains('"@timestamp"');
  });

  it('console.debug works', () => {
    const backupLevel = GetLogLevel();
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole(LOG_LEVEL.debug);

    try {
      console.debug('this is a message', {'extra-context': 'hello'});
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(outputText[0]).contains('{"level":"debug","message":"this is a message","extra-context":"hello"');
  });

  it('console.silly works', () => {
    const backupLevel = GetLogLevel();
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole(LOG_LEVEL.silly);

    try {
      console.silly('this is a message', {'extra-context': 'hello'});
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(outputText[0]).contains('{"level":"silly","message":"this is a message","extra-context":"hello"');
  });


  it('console.warn works with log level info', () => {
    const backupLevel = GetLogLevel();
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole(LOG_LEVEL.info);

    try {
      console.warn('this is a message', {'extra-context': 'hello'});
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(outputText[0]).contains('{"level":"warn","message":"this is a message","extra-context":"hello"');
  });


  it('console.warn is not shown with log level error', () => {
    const backupLevel = GetLogLevel();
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole(LOG_LEVEL.error);

    try {
      console.warn('this is a message', {'extra-context': 'hello'});
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    console.log(outputText[0]);
    expect(outputText[0]).equals(undefined);
  });

  it('logs error properly when extra context is a string',async ()=> {
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    const extraContext = 'this is a test string';
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new ErrorWithContext(`error message 1`, extraContext as any);
    } catch (err)
    {
      console.log(err);
    }
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // console.log(outputText[0]);
    expect(outputText[0]).contains('"level":"error","message":" - error message 1 - this is a test string","stack":"Error: error message 1 - this is a test string');
  });

  it('logs error properly when extra context is a string and main error is an error object',async ()=> {
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    const extraContext = 'this is a test string';
    const mainError = new Error('error message 2');
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new ErrorWithContext(mainError, extraContext as any);
    } catch (err)
    {
      console.log(err);
    }
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // console.log(outputText[0]);
    expect(outputText[0]).contains('"level":"error","message":" - error message 2 - this is a test string","stack":"Error: error message 2 - this is a test string');
  });

  it('console.info works', async()=>{
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    console.info('this is a test', {a:'stuff-a', b:'stuff-b'}, 'more messages', {c:'stuff-c'});

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    console.log(outputText[0]);
    expect(outputText[0]).contains('{"level":"info","message":"this is a test - more messages","a":"stuff-a","b":"stuff-b","c":"stuff-c"');
  });

  it('console.log exception but is handled without crashing out', async()=>{
    // arrange
    const {originalWrite} = overrideStdOut();
    LoggerAdaptToConsole();
    console.exception = () => { throw new Error('this is a test')};
    let caughtErr = null;

    // action
    try {
      console.log('this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});
    } catch (err) {
      caughtErr = err;
    }

    // reset
    delete console.exception;
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // assert
    expect(caughtErr).equal(null);
  });

  it('filters colors', () =>{
    const messageWithColors = "\u001b[90m================================\u001b[39m\n \u001b[33mMissing\u001b[39m environment variables:\n    \u001b[34mCCE_MONGO_CONNECTION\u001b[39m: undefined\n\u001b[33m\u001b[39m\n\u001b[33m Exiting with error code 1\u001b[39m\n\u001b[90m================================\u001b[39m";
    const {originalWrite, outputText} = overrideStdOut();
    LoggerAdaptToConsole();

    console.log(messageWithColors);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    expect((outputText[0] as string).indexOf('\\u001b[90m') === 27).equals(false,'the color string should not be in the output');
    expect(outputText[0]).contain('"================================\\n Missing environment variables:\\n    CCE_MONGO_CONNECTION: undefined\\n\\n Exiting with error code 1\\n================================"');
  });

  it('throws an error with additional context', () => {
    const baseErr = Error('a random error');
    const errWithContext = new ErrorWithContext(baseErr, {additional: 'context'});

    expect(errWithContext.message).to.eql('a random error');
    expect((errWithContext as any).extraContext.additional).to.eql('context');
  });

  // Todo: test multiple nested ErrorWithContext objects to ensure proper stacktrace and error messages
});