import { expect } from 'chai';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sinon from 'sinon';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

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

  it('preserves caller filename and stack for Node ESM startup logs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clj-esm-'));
    const packageDir = path.join(tempDir, 'node_modules', 'console-log-json');
    const distDir = path.join(packageDir, 'dist', 'esm');
    const bundlePath = path.join(distDir, 'index.mjs');
    const entryPath = path.join(tempDir, 'index.js');
    const packageJsonPath = path.join(tempDir, 'package.json');
    const dependencyPackageJsonPath = path.join(packageDir, 'package.json');

    try {
      fs.mkdirSync(distDir, { recursive: true });

      esbuild.buildSync({
        entryPoints: [path.join(process.cwd(), 'src', 'index.ts')],
        outfile: bundlePath,
        bundle: true,
        format: 'esm',
        platform: 'node',
        sourcemap: false,
        target: 'es2017',
      });

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify({
          name: 'console-log-json-package-name-issue',
          private: true,
          type: 'module',
        })
      );

      fs.writeFileSync(
        dependencyPackageJsonPath,
        JSON.stringify({
          name: 'console-log-json',
          version: '6.0.0',
          type: 'module',
        })
      );

      fs.writeFileSync(
        entryPath,
        [
          `import { LoggerAdaptToConsole } from ${JSON.stringify(pathToFileURL(bundlePath).href)};`,
          'LoggerAdaptToConsole();',
          "console.log('Hello world!');",
        ].join('\n')
      );

      const result = spawnSync('node', [entryPath], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(result.status).to.equal(0);
      expect(result.stderr).to.equal('');

      const outputLine = result.stdout.trim().split('\n').find((line) => line.startsWith('{'));
      expect(outputLine).to.not.equal(undefined);

      const parsed = JSON.parse(outputLine!);
      expect(parsed.message).to.equal('Hello world!');
      expect(parsed['@packageName']).to.equal('console-log-json-package-name-issue');
      expect(parsed['@filename']).to.include('/index.js');
      expect(parsed['@filename']).to.not.include('/dist/');
      expect(parsed['@filename']).to.not.include('console-log-json.mjs');
      expect(parsed['@logCallStack']).to.be.a('string');
      expect(parsed['@logCallStack']).to.include('/index.js');
      expect(parsed['@logCallStack']).to.not.equal('Error');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
