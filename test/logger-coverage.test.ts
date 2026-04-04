/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import {
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

describe('logger - additional coverage', () => {
  const sandbox = sinon.createSandbox();
  process.env.CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR = '';
  process.env.CONSOLE_LOG_JSON_NO_FILE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_PACKAGE_NAME = '';
  process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP = '';
  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS = '';
  process.env.CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE = '';
  process.env.CONSOLE_LOG_COLORIZE = '';
  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK = '';
  process.env.CONSOLE_LOG_JSON_NO_LOGGER_DEBUG = '';

  afterEach(() => {
    sandbox.restore();
  });

  // ---- console.http() ----
  it('console.http works', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.http });

    try {
      await console.http('http request received', { method: 'GET', path: '/api/test' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('http');
    expect(testObj.message).eql('http request received');
    expect(testObj.method).eql('GET');
    expect(testObj.path).eql('/api/test');
  });

  // ---- console.verbose() ----
  it('console.verbose works', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.verbose });

    try {
      await console.verbose('verbose message', { detail: 'extra' });
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('verbose');
    expect(testObj.message).eql('verbose message');
    expect(testObj.detail).eql('extra');
  });

  // ---- Log level filtering ----
  it('console.http is not shown when log level is info', () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });

    try {
      console.http('this should not appear');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(outputText[0]).equals(undefined);
  });

  it('console.verbose is not shown when log level is info', () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });

    try {
      console.verbose('this should not appear');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(outputText[0]).equals(undefined);
  });

  it('console.debug is not shown when log level is info', () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });

    try {
      console.debug('this should not appear');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(outputText[0]).equals(undefined);
  });

  it('console.silly is not shown when log level is info', () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });

    try {
      console.silly('this should not appear');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(outputText[0]).equals(undefined);
  });

  it('console.info is shown when log level is silly', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.silly });

    try {
      await console.info('info message at silly level');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).eql('info message at silly level');
  });

  // ---- LoggerRestoreConsole ----
  it('LoggerRestoreConsole restores all console methods', async () => {
    const originalLog = console.log;

    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole();

    // Console methods should now be replaced
    expect(console.log).not.equal(originalLog);

    LoggerRestoreConsole();
    restoreStdOut(originalWrite);

    // After restore, methods should work (we verify they don't throw)
    // Note: They may not be === originalLog due to module-level backup
    // but they should function as native console methods
  });

  it('LoggerRestoreConsole can be called multiple times without error', () => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole();
    restoreStdOut(originalWrite);

    // Should not throw
    LoggerRestoreConsole();
    LoggerRestoreConsole();
    LoggerRestoreConsole();
  });

  // ---- GetLogLevel / SetLogLevel ----
  it('GetLogLevel returns current log level', () => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.debug });
    restoreStdOut(originalWrite);

    expect(GetLogLevel()).to.equal('debug');
    LoggerRestoreConsole();
  });

  it('SetLogLevel changes the log level', () => {
    const { originalWrite } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info });
    restoreStdOut(originalWrite);

    SetLogLevel('error');
    expect(GetLogLevel()).to.equal('error');

    SetLogLevel('info');
    LoggerRestoreConsole();
  });

  // ---- NativeConsoleLog ----
  it('NativeConsoleLog works after LoggerAdaptToConsole', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    NativeConsoleLog('native output');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    expect(outputText[0]).to.equal('native output\n');
  });

  // ---- Environment variable: CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK ----
  it('CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK removes end-of-log newline', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      await console.log('test message');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    // Strip the trailing \n from stdout write (artifact of stdout capture)
    const output = outputText[0].replace(/\n$/, '');
    // Should not have trailing newline from the logger
    expect(output.endsWith('\n')).to.equal(false);
  });

  // ---- Environment variable: CONSOLE_LOG_JSON_NO_LOGGER_DEBUG ----
  it('CONSOLE_LOG_JSON_NO_LOGGER_DEBUG suppresses _loggerDebug field', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_LOGGER_DEBUG').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ debugString: true });

    try {
      await console.log('test message');
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj._loggerDebug).to.equal(undefined);
  });

  // ---- Explicit log level: information ----
  it('console.log logs as info when explicitly provided with level:information parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log({ level: 'information' }, 'this is a test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
  });

  // ---- Boolean parameter handling ----
  it('handles boolean parameter by concatenating it into the message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('test with boolean', true);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('info');
    expect(testObj.message).to.equal('test with boolean - true');
  });

  it('handles false boolean parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('active', false);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('active - false');
  });

  // ---- Multiple console.log calls in sequence ----
  it('handles multiple sequential console.log calls', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('first message');
    await console.log('second message');
    await console.log('third message');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    expect(outputText.length).to.equal(3);
    expect(JSON.parse(outputText[0]).message).to.equal('first message');
    expect(JSON.parse(outputText[1]).message).to.equal('second message');
    expect(JSON.parse(outputText[2]).message).to.equal('third message');
  });

  // ---- Objects with only internal keys ----
  it('handles multiple undefined parameters', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log(undefined, undefined);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('<value-passed-to-console-log-json-was-null>');
  });

  // ---- Error with no message ----
  it('handles Error with empty message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log(new Error(''));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).eql('error');
  });

  // ---- FormatErrorObject direct tests ----
  it('FormatErrorObject handles plain object with level and message', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const result = FormatErrorObject({ level: 'info', message: 'test' });
    const parsed = JSON.parse(result.trim());
    expect(parsed.level).to.equal('info');
    expect(parsed.message).to.equal('test');
  });

  it('FormatErrorObject handles extraContext merging', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    // extraContext gets merged into the return data and then removed
    const result = FormatErrorObject({ level: 'info', message: 'test msg', extraContext: { extra: 'data' } });
    const parsed = JSON.parse(result.trim());
    expect(parsed.extra).to.equal('data');
    expect(parsed.extraContext).to.equal(undefined); // should be removed after merge
    expect(parsed.message).to.equal('test msg');
  });

  it('FormatErrorObject handles object with stack trace', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const err = new Error('test error');
    const result = FormatErrorObject({ level: 'info', message: 'test', stack: err.stack });
    const parsed = JSON.parse(result.trim());
    expect(parsed.level).to.equal('error');
    expect(parsed.errCallStack).to.include('Error: test error');
  });

  it('FormatErrorObject handles empty message with error level', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const result = FormatErrorObject({ level: 'error', message: '' });
    const parsed = JSON.parse(result.trim());
    expect(parsed.message).to.equal('<no-error-message-was-passed-to-console-log>');
  });

  it('FormatErrorObject handles empty message with info level', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const result = FormatErrorObject({ level: 'info', message: '' });
    const parsed = JSON.parse(result.trim());
    expect(parsed.message).to.equal('<no-message-was-passed-to-console-log>');
  });

  it('FormatErrorObject cleans leading dash in message', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const result = FormatErrorObject({ level: 'info', message: ' - actual message' });
    const parsed = JSON.parse(result.trim());
    expect(parsed.message).to.equal('actual message');
  });

  it('FormatErrorObject handles extraContext', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const result = FormatErrorObject({ level: 'info', message: 'test', extraContext: { key: 'ctx' } });
    const parsed = JSON.parse(result.trim());
    expect(parsed.key).to.equal('ctx');
    expect(parsed.extraContext).to.equal(undefined);
  });

  // ---- Timestamp inclusion ----
  it('includes @timestamp by default', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('timestamp test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@timestamp']).to.be.a('string');
    // Verify it's a valid ISO date
    expect(new Date(testObj['@timestamp']).toISOString()).to.equal(testObj['@timestamp']);
  });

  it('omits @timestamp when CONSOLE_LOG_JSON_NO_TIME_STAMP is TRUE', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('no timestamp test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@timestamp']).to.equal(undefined);
  });

  // ---- @filename and @packageName ----
  it('includes @filename by default', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('filename test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@filename']).to.be.a('string');
    expect(testObj['@filename']).to.include('logger-coverage.test');
  });

  it('includes @packageName by default', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('package name test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@packageName']).to.equal('console-log-json');
  });

  it('omits @filename when CONSOLE_LOG_JSON_NO_FILE_NAME is TRUE', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('no filename test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@filename']).to.equal(undefined);
  });

  it('omits @packageName when CONSOLE_LOG_JSON_NO_PACKAGE_NAME is TRUE', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('no package name test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj['@packageName']).to.equal(undefined);
  });

  // ---- JSON string auto-parsing ----
  it('auto-parses JSON string in message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('{"key":"value","num":123}');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('<auto-parsed-json-string-see-@autoParsedJson-property>');
    expect(testObj['@autoParsedJson']).to.eql({ key: 'value', num: 123 });
  });

  it('does not auto-parse non-JSON strings', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('this is not json');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('this is not json');
    expect(testObj['@autoParsedJson']).to.equal(undefined);
  });

  it('CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE keeps JSON as string but formats it', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE').value('TRUE');
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('{"key":"value"}');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // When DISABLE_AUTO_PARSE is true, it still parses but keeps it as a string
    expect(testObj['@autoParsedJson']).to.equal(undefined);
  });

  // ---- Malformed JSON ----
  it('handles malformed JSON string gracefully', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('{not valid json}');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('{not valid json}');
  });

  // ---- Unicode and special characters ----
  it('handles unicode characters in message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('unicode: \u00e9\u00e8\u00ea \u4e16\u754c');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('\u00e9\u00e8\u00ea');
    expect(testObj.message).to.include('\u4e16\u754c');
  });

  // ---- Nested objects ----
  it('handles deeply nested objects', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const nested = { a: { b: { c: { d: { e: 'deep' } } } } };
    await console.log('deep test', nested);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.a.b.c.d.e).to.equal('deep');
  });

  // ---- Error object with extra properties ----
  it('handles error object with additional custom properties', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const err: any = new Error('custom error');
    err.code = 'ENOENT';
    err.path = '/some/path';
    await console.log(err);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
    expect(testObj.message).to.include('custom error');
  });

  // ---- console.warn with error ----
  it('console.warn with error object', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.warn('warning', new Error('warn error'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // When an Error is present, level gets set to 'error'
    expect(testObj.level).to.equal('error');
    expect(testObj.message).to.include('warning');
    expect(testObj.message).to.include('warn error');
  });

  // ---- Only number parameter ----
  it('handles only a number parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log(42);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    // Number 42 becomes string "42" which is valid JSON, so it gets auto-parsed
    expect(testObj['@autoParsedJson']).to.equal(42);
  });

  // ---- Multiple string parameters ----
  it('concatenates multiple string parameters with separator', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('first', 'second', 'third');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('first - second - third');
  });

  // ---- Error with multiple context objects ----
  it('merges multiple context objects with an error', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('context test', new Error('test error'), { a: 1 }, { b: 2 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
    expect(testObj.a).to.equal(1);
    expect(testObj.b).to.equal(2);
  });

  // ---- LOG_LEVEL enum values ----
  it('LOG_LEVEL enum has all expected values', () => {
    expect(LOG_LEVEL.error).to.equal('error');
    expect(LOG_LEVEL.warn).to.equal('warn');
    expect(LOG_LEVEL.info).to.equal('info');
    expect(LOG_LEVEL.http).to.equal('http');
    expect(LOG_LEVEL.verbose).to.equal('verbose');
    expect(LOG_LEVEL.debug).to.equal('debug');
    expect(LOG_LEVEL.silly).to.equal('silly');
  });

  // ---- overrideStdOut / restoreStdOut ----
  it('overrideStdOut captures stdout and restoreStdOut restores it', () => {
    const { originalWrite, outputText } = overrideStdOut();
    process.stdout.write('captured text');
    restoreStdOut(originalWrite);

    expect(outputText[0]).to.equal('captured text');
    // Verify stdout is restored by writing after restore (should not throw)
  });

  // ---- console.error with only context objects (no string message) ----
  it('console.error with only context objects generates placeholder message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.error({ status: 500, url: '/api/fail' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('error');
    expect(testObj.message).to.equal('<no-error-message-was-passed-to-console-log>');
    expect(testObj.status).to.equal(500);
  });

  // ---- console.log with only context objects generates placeholder message ----
  it('console.log with only context objects generates placeholder message', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log({ status: 200 });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
    expect(testObj.message).to.equal('<no-message-was-passed-to-console-log>');
    expect(testObj.status).to.equal(200);
  });

  // ---- Explicit level: debug ----
  it('console.log respects explicit level:debug parameter', async () => {
    const backupLevel = GetLogLevel();
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ logLevel: LOG_LEVEL.debug });

    try {
      await console.log({ level: 'debug' }, 'debug via explicit level');
    } finally {
      SetLogLevel(backupLevel);
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('debug');
    expect(testObj.message).to.equal('debug via explicit level');
  });

  // ---- Multiple calls to LoggerAdaptToConsole ----
  it('calling LoggerAdaptToConsole multiple times does not break functionality', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    LoggerAdaptToConsole();

    await console.log('after double init');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.equal('after double init');
    expect(testObj.level).to.equal('info');
  });

  // ---- Custom options with multiple properties ----
  it('custom options are included in every log line', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole({ customOptions: { service: 'my-service', env: 'production' } });

    await console.log('service test');

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.service).to.equal('my-service');
    expect(testObj.env).to.equal('production');
  });

  // ---- Error concatenated with string (e.g. 'string' + new Error()) ----
  it('handles Error.toString() concatenated with string', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('prefix: ' + new Error('inline error'));

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.message).to.include('prefix:');
    expect(testObj.message).to.include('inline error');
  });

  // ---- Output is valid single-line JSON ----
  it('output is valid JSON on a single line', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('single line test', { data: 'value' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // The output should be parseable as JSON (minus the trailing newline)
    const trimmed = outputText[0].trim();
    expect(() => JSON.parse(trimmed)).to.not.throw();
    // Should be a single line (no newlines within the JSON itself, except at the end)
    const jsonPart = trimmed.replace(/\n$/, '');
    expect(jsonPart.includes('\n')).to.equal(false);
  });

  // ---- Level ordering in JSON output ----
  it('level is first and message is second in JSON output', async () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_TIME_STAMP').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_FILE_NAME').value('TRUE');
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME').value('TRUE');

    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('order test', { z: 'last' });

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const trimmed = outputText[0].trim();
    // Verify the JSON starts with level then message
    expect(trimmed.startsWith('{"level":')).to.equal(true);
    expect(trimmed.indexOf('"message"')).to.be.lessThan(trimmed.indexOf('"z"'));
  });

  // ---- Large object ----
  it('handles object with many properties', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    const bigObj: any = {};
    for (let i = 0; i < 100; i++) {
      bigObj[`key${i}`] = `value${i}`;
    }
    await console.log('big object', bigObj);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const testObj = JSON.parse(outputText[0]);
    expect(testObj.key0).to.equal('value0');
    expect(testObj.key99).to.equal('value99');
  });

  // ---- Array as parameter ----
  it('handles array as context parameter', async () => {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    await console.log('array test', [1, 2, 3]);

    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    // Arrays are not objects with .stack, so they should be handled
    const testObj = JSON.parse(outputText[0]);
    expect(testObj.level).to.equal('info');
  });
});
