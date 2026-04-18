import { expect } from 'chai';
import sinon from 'sinon';

import { LoggerAdaptToConsole, LoggerRestoreConsole } from '../src';
import * as packageNameModule from '../src/package-name';

describe('@packageName initialization', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
    LoggerRestoreConsole();
  });

  it('buffers startup logs until async package name resolution completes', async () => {
    sandbox.stub(packageNameModule, 'getPackageNameSync').returns('');

    let resolvePackageName!: (value: string) => void;
    sandbox.stub(packageNameModule, 'getPackageNameAsync').returns(
      new Promise((resolve) => {
        resolvePackageName = resolve;
      })
    );

    let capturedLog: any = null;
    const waitForLog = new Promise<void>((resolve) => {
      LoggerAdaptToConsole({
        envOptions: {
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
        },
        onLog: (_jsonString, parsedObject) => {
          capturedLog = parsedObject;
          resolve();
        },
      });
    });

    console.log('hello from esm startup');
    expect(capturedLog).to.equal(null);

    resolvePackageName('console-log-json-package-name-issue');
    await waitForLog;

    expect(capturedLog.message).to.equal('hello from esm startup');
    expect(capturedLog['@packageName']).to.equal('console-log-json-package-name-issue');
  });

  it('does not emit the not-yet-set placeholder when async package name lookup fails', async () => {
    sandbox.stub(packageNameModule, 'getPackageNameSync').returns('');
    sandbox.stub(packageNameModule, 'getPackageNameAsync').resolves('');

    let capturedLog: any = null;
    const waitForLog = new Promise<void>((resolve) => {
      LoggerAdaptToConsole({
        envOptions: {
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
        },
        onLog: (_jsonString, parsedObject) => {
          capturedLog = parsedObject;
          resolve();
        },
      });
    });

    console.log('hello without package');
    await waitForLog;

    expect(capturedLog.message).to.equal('hello without package');
    expect(capturedLog['@packageName']).to.equal(undefined);
  });
});
