/* tslint:disable:object-literal-sort-keys */
import { jest } from '@jest/globals';
import { expect } from 'chai';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import puppeteer from 'puppeteer-core';
import { LoggerAdaptToConsole, LoggerRestoreConsole, overrideStdOut, restoreStdOut } from '../src';

// Find Chrome/Chromium across platforms
function findChrome(): string | null {
  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux (Debian/Ubuntu)
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Linux (snap)
    '/snap/bin/chromium',
    // Windows (common paths)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  // Also check CHROME_PATH env var (for CI or custom setups)
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    candidates.unshift(envPath);
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const CHROME_EXECUTABLE = findChrome();
const PROJECT_ROOT = process.cwd();
const SRC_INDEX = path.join(PROJECT_ROOT, 'src', 'index.ts');
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'browser-test-bundle.js');

jest.setTimeout(30000);

const describeBrowser = CHROME_EXECUTABLE ? describe : describe.skip;

describeBrowser('Real browser tests (headless Chrome)', () => {

  let browser: any;
  let page: any;

  beforeAll(async () => {
    // Bundle the library for browser using esbuild
    await esbuild.build({
      entryPoints: [SRC_INDEX],
      bundle: true,
      outfile: BUNDLE_PATH,
      platform: 'browser',
      format: 'iife',
      globalName: 'ConsoleLogJson',
      sourcemap: false,
      define: {
        'process.env': '{}',
        'process.cwd': 'undefined',
      },
      external: [],
    });

    browser = await puppeteer.launch({
      executablePath: CHROME_EXECUTABLE!,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    // Cleanup bundle
    try {
      fs.unlinkSync(BUNDLE_PATH);
    } catch (_) {
      // ignore
    }
  });

  async function runInBrowser(code: string): Promise<any[]> {
    // Create a page that loads the bundle and captures console output
    const bundleContent = fs.readFileSync(BUNDLE_PATH, 'utf8');

    const logs: any[] = [];
    page.on('console', (msg: any) => {
      logs.push(msg.text());
    });

    await page.setContent('<html><body></body></html>');
    await page.evaluate(bundleContent);

    // Run the test code
    await page.evaluate(code);

    // Remove listener to avoid accumulation
    page.removeAllListeners('console');

    return logs;
  }

  it('library loads without errors in browser', async () => {
    const bundleContent = fs.readFileSync(BUNDLE_PATH, 'utf8');
    await page.setContent('<html><body></body></html>');

    let error: any = null;
    page.on('pageerror', (err: any) => {
      error = err;
    });

    await page.evaluate(bundleContent);
    page.removeAllListeners('pageerror');

    expect(error).to.equal(null);
  });

  it('LoggerAdaptToConsole does not throw in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      ConsoleLogJson.LoggerRestoreConsole();
    `);
    // Should not produce error logs
    const errorLogs = logs.filter((l) => l.includes('"level":"error"'));
    expect(errorLogs.length).to.equal(0);
  });

  it('console.log produces valid JSON in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('hello from browser');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    // Find the JSON log line (not the raw writeOutput trailing newline)
    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    expect(jsonLogs.length).to.be.greaterThan(0);

    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.level).to.equal('info');
    expect(parsed.message).to.equal('hello from browser');
  });

  it('ignores fake process.stdout.write in browser-like hosts', async () => {
    const logs = await runInBrowser(`
      window.__stdoutWrites = [];
      window.process = {
        env: {},
        stdout: {
          write: function (text) {
            window.__stdoutWrites.push(text);
          }
        }
      };

      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('browser with fake stdout');
      ConsoleLogJson.LoggerRestoreConsole();
      console.log(JSON.stringify({ __stdoutWrites: window.__stdoutWrites.length }));
    `);

    const parsedLogs = logs
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));

    const logEntry = parsedLogs.find((l) => l.level === 'info');
    expect(logEntry).to.not.equal(undefined);
    expect(logEntry.message).to.equal('browser with fake stdout');

    const summary = parsedLogs.find((l) => l.__stdoutWrites !== undefined);
    expect(summary).to.not.equal(undefined);
    expect(summary.__stdoutWrites).to.equal(0);
  });

  it('drops re-entrant feedback from a saved browser console implementation', async () => {
    const logs = await runInBrowser(`
      const originalConsoleLog = console.log;
      window.__nativeConsoleCalls = [];
      window.__feedbackCalls = 0;

      console.log = function () {
        window.__nativeConsoleCalls.push(Array.from(arguments));
        originalConsoleLog.apply(window.console, arguments);
        if (window.__feedbackCalls === 0) {
          window.__feedbackCalls += 1;
          window.console.log.apply(window.console, arguments);
        }
      };

      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('browser re-entry');
      ConsoleLogJson.LoggerRestoreConsole();
      console.log = originalConsoleLog;

      originalConsoleLog(JSON.stringify({
        __nativeConsoleCalls: window.__nativeConsoleCalls.length,
        __feedbackCalls: window.__feedbackCalls
      }));
    `);

    const parsedLogs = logs
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));

    const logEntry = parsedLogs.find((l) => l.level === 'info');
    expect(logEntry).to.not.equal(undefined);
    expect(logEntry.message).to.equal('browser re-entry');

    const summary = parsedLogs.find((l) => l.__nativeConsoleCalls !== undefined);
    expect(summary).to.not.equal(undefined);
    expect(summary.__feedbackCalls).to.equal(1);
    expect(summary.__nativeConsoleCalls).to.equal(1);
  });

  it('console.error produces level:error in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.error('browser error', { code: 500 });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    expect(jsonLogs.length).to.be.greaterThan(0);

    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.level).to.equal('error');
    expect(parsed.message).to.include('browser error');
  });

  it('console.warn produces level:warn in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.warn('browser warning');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    expect(jsonLogs.length).to.be.greaterThan(0);

    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.level).to.equal('warn');
    expect(parsed.message).to.equal('browser warning');
  });

  it('context objects are included in browser output', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('with context', { userId: 42, action: 'click' });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.message).to.equal('with context');
    expect(parsed.userId).to.equal(42);
    expect(parsed.action).to.equal('click');
  });

  it('error objects produce errCallStack in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('caught error', new Error('something broke'));
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.level).to.equal('error');
    expect(parsed.message).to.include('something broke');
    expect(parsed.errCallStack).to.be.a('string');
    expect(parsed.errCallStack).to.include('something broke');
  });

  it('circular references are handled in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      var obj = { name: 'test' };
      obj.self = obj;
      console.log('circular', obj);
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.name).to.equal('test');
    expect(parsed.self).to.include('[Circular');
  });

  it('multiple arguments in any order work in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log({ a: 1 }, 'message', 42, { b: 2 });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.message).to.equal('message - 42');
    expect(parsed.a).to.equal(1);
    expect(parsed.b).to.equal(2);
  });

  it('null and undefined parameters are handled in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log(null, 'survived', undefined);
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.message).to.include('survived');
  });

  it('LoggerRestoreConsole restores original console in browser', async () => {
    const logs = await runInBrowser(`
      var originalLog = console.log;
      ConsoleLogJson.LoggerAdaptToConsole();
      ConsoleLogJson.LoggerRestoreConsole();
      // After restore, console.log should produce plain output, not JSON
      console.log('restored');
    `);

    // 'restored' should appear as plain text, not JSON
    const plainLogs = logs.filter((l) => l === 'restored');
    expect(plainLogs.length).to.equal(1);
  });

  it('@filename shows <unknown> in browser (no filesystem)', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('filename test');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    // In browser, filename detection can't work — should show <unknown> or a browser path
    expect(parsed['@filename']).to.be.a('string');
  });

  // ============================================================
  // envOptions in browser
  // ============================================================

  it('envOptions: CONSOLE_LOG_JSON_NO_TIME_STAMP suppresses timestamp in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: { CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true' }
      });
      console.log('no timestamp');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.message).to.equal('no timestamp');
    expect(parsed['@timestamp']).to.equal(undefined);
  });

  it('envOptions: CONSOLE_LOG_JSON_NO_FILE_NAME suppresses filename in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: { CONSOLE_LOG_JSON_NO_FILE_NAME: 'true' }
      });
      console.log('no filename');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed['@filename']).to.equal(undefined);
  });

  it('envOptions: CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR suppresses call stack in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: { CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true' }
      });
      console.log('no stack');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed['@logCallStack']).to.equal(undefined);
  });

  it('envOptions: CONSOLE_LOG_JSON_NO_PACKAGE_NAME suppresses package name in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: { CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true' }
      });
      console.log('no package');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed['@packageName']).to.equal(undefined);
  });

  it('envOptions: CONSOLE_LOG_JSON_CONTEXT_KEY nests context in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: {
          CONSOLE_LOG_JSON_CONTEXT_KEY: 'data',
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true'
        }
      });
      console.log('nested', { key: 'value', num: 42 });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.message).to.equal('nested');
    expect(parsed.data).to.eql({ key: 'value', num: 42 });
    expect(parsed.key).to.equal(undefined);
  });

  it('envOptions: multiple flags produce minimal output in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: {
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true'
        }
      });
      console.log('minimal');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed).to.eql({ level: 'info', message: 'minimal' });
  });

  it('envOptions: works with customOptions in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        customOptions: { app: 'my-frontend', version: '2.0' },
        envOptions: {
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true'
        }
      });
      console.log('with options', { action: 'click' });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    expect(parsed.level).to.equal('info');
    expect(parsed.message).to.equal('with options');
    expect(parsed.app).to.equal('my-frontend');
    expect(parsed.version).to.equal('2.0');
    expect(parsed.action).to.equal('click');
  });

  it('envOptions: CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE disables JSON parsing in browser', async () => {
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole({
        envOptions: {
          CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE: 'true',
          CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
          CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_PACKAGE_NAME: 'true',
          CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true'
        }
      });
      console.log('{"event":"click"}');
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const parsed = JSON.parse(jsonLogs[0]);
    // With auto-parse disabled, the JSON string stays as-is in message (re-stringified)
    expect(parsed['@autoParsedJson']).to.equal(undefined);
  });

  it('output structure matches between Node and browser', async () => {
    // Run the same log in Node
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();
    console.log('structure test', { key: 'value' });
    restoreStdOut(originalWrite);
    LoggerRestoreConsole();

    const nodeObj = JSON.parse(outputText[0]);

    // Run the same log in browser
    const logs = await runInBrowser(`
      ConsoleLogJson.LoggerAdaptToConsole();
      console.log('structure test', { key: 'value' });
      ConsoleLogJson.LoggerRestoreConsole();
    `);

    const jsonLogs = logs.filter((l) => l.startsWith('{'));
    const browserObj = JSON.parse(jsonLogs[0]);

    // Both should have the same core fields
    expect(browserObj.level).to.equal(nodeObj.level);
    expect(browserObj.message).to.equal(nodeObj.message);
    expect(browserObj.key).to.equal(nodeObj.key);

    // Both should have level as first key and message as second
    const nodeKeys = Object.keys(nodeObj);
    const browserKeys = Object.keys(browserObj);
    expect(browserKeys[0]).to.equal('level');
    expect(browserKeys[1]).to.equal('message');
    expect(nodeKeys[0]).to.equal('level');
    expect(nodeKeys[1]).to.equal('message');
  });
});
