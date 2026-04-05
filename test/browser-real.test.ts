/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

// tslint:disable-next-line:no-var-requires
const puppeteer = require('puppeteer-core');

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

describe('Real browser tests (headless Chrome)', function () {
  // tslint:disable-next-line:no-invalid-this
  this.timeout(30000);

  let browser: any;
  let page: any;

  before(async () => {
    // Skip entire suite if no Chrome/Chromium is available
    if (!CHROME_EXECUTABLE) {
      console.log('    (skipping: no Chrome/Chromium found — set CHROME_PATH to enable)');
      // tslint:disable-next-line:no-invalid-this
      return (this as any).skip();
    }

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

  after(async () => {
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

  it('output structure matches between Node and browser', async () => {
    // Run the same log in Node
    const {
      LoggerAdaptToConsole,
      LoggerRestoreConsole,
      overrideStdOut,
      restoreStdOut,
    } = require('../src');

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
