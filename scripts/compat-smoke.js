#!/usr/bin/env node
// Runtime compatibility smoke test for old Node.js versions (package.json "engines": node >= 10).
//
// The Jest suite needs a modern Node (Jest 30, TypeScript 6), so it can't run on the oldest
// Node versions we support. This script can: it is plain ES2017 JavaScript with no
// dependencies. It installs a packed tarball into a throwaway app the way a consumer would,
// then runs the public API in child processes and checks the JSON output.
//
// Usage: node scripts/compat-smoke.js path/to/console-log-json-x.y.z.tgz
//
// Keep this file compatible with Node 10: no optional chaining, no nullish coalescing,
// no fs.rmSync, no top-level await.
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tarball = process.argv[2];
if (!tarball || !fs.existsSync(tarball)) {
  console.error('Usage: node scripts/compat-smoke.js path/to/console-log-json-x.y.z.tgz');
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeMinor = Number(process.versions.node.split('.')[1]);
// Conditional "exports" with an "import" condition works unflagged from Node 12.20 / 13.2+.
const supportsEsm = nodeMajor >= 14 || (nodeMajor === 12 && nodeMinor >= 20) || nodeMajor === 13;

const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clj-compat-'));
const pkgDir = path.join(appDir, 'node_modules', 'console-log-json');
mkdirp(pkgDir);
childProcess.execFileSync('tar', ['-xzf', path.resolve(tarball), '-C', pkgDir, '--strip-components=1']);
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'compat-app', version: '1.0.0', private: true }));

const QUIET = '{ noStackForNonError: true }';

const cjsScenarios = [
  {
    name: 'basic log with context and metadata',
    code: `const { LoggerAdaptToConsole } = require('console-log-json');
      LoggerAdaptToConsole();
      console.log('user signed in', { userId: 42 });`,
    check(logs) {
      assert.strictEqual(logs.length, 1);
      const log = logs[0];
      assert.strictEqual(log.level, 'info');
      assert.strictEqual(log.message, 'user signed in');
      assert.strictEqual(log.userId, 42);
      assert.ok(/Z$/.test(log['@timestamp']), '@timestamp is ISO UTC');
      assert.ok(/app\.js$/.test(log['@filename']), '@filename points at the caller: ' + log['@filename']);
      assert.strictEqual(log['@packageName'], 'compat-app');
      assert.ok(/^at /.test(log['@logCallStack']), '@logCallStack starts with "at": ' + log['@logCallStack']);
    },
  },
  {
    name: 'error object sets level and errCallStack',
    code: `const { LoggerAdaptToConsole } = require('console-log-json');
      LoggerAdaptToConsole(${QUIET});
      console.log('request failed', 500, new Error('timeout'), { endpoint: '/api' });`,
    check(logs) {
      const log = logs[0];
      assert.strictEqual(log.level, 'error');
      assert.strictEqual(log.message, 'request failed - 500 - timeout');
      assert.strictEqual(log.endpoint, '/api');
      assert.ok(log.errCallStack.indexOf('Error: timeout') === 0, 'errCallStack: ' + log.errCallStack);
    },
  },
  {
    name: 'ErrorWithContext keeps context and the causal chain',
    code: `const { LoggerAdaptToConsole, ErrorWithContext } = require('console-log-json');
      LoggerAdaptToConsole(${QUIET});
      console.error(new ErrorWithContext(new Error('connection refused'), { table: 'users' }));`,
    check(logs) {
      const log = logs[0];
      assert.strictEqual(log.level, 'error');
      assert.strictEqual(log.message, 'connection refused');
      assert.strictEqual(log.table, 'users');
      assert.ok(log.errCallStack.indexOf('\nCaused By: Error: connection refused') !== -1, 'errCallStack: ' + log.errCallStack);
    },
  },
  {
    name: 'log level filtering and SetLogLevel',
    code: `const { LoggerAdaptToConsole, SetLogLevel, GetLogLevel, LOG_LEVEL } = require('console-log-json');
      LoggerAdaptToConsole({ logLevel: LOG_LEVEL.warn, noStackForNonError: true });
      console.info('suppressed');
      console.warn('shown');
      SetLogLevel('DEBUG');
      console.debug('debug ' + GetLogLevel());`,
    check(logs) {
      assert.deepStrictEqual(
        logs.map((l) => l.level + ':' + l.message),
        ['warn:shown', 'debug:debug debug'],
      );
    },
  },
  {
    name: 'redaction, transformOutput and onLog',
    code: `const { LoggerAdaptToConsole } = require('console-log-json');
      LoggerAdaptToConsole({
        noStackForNonError: true,
        redact: ['password', 'headers.authorization'],
        transformOutput: (o) => { o.service = 'billing'; return o; },
        onLog: (json, parsed) => { process.stdout.write(JSON.stringify({ onLog: parsed.service, password: parsed.password }) + '\\n'); },
      });
      console.log('login', { password: 'hunter2', headers: { authorization: 'Bearer x' } });`,
    check(logs) {
      assert.strictEqual(logs.length, 2);
      assert.strictEqual(logs[0].password, 'Redacted');
      assert.strictEqual(logs[0].headers.authorization, 'Redacted');
      assert.strictEqual(logs[0].service, 'billing');
      assert.deepStrictEqual(logs[1], { onLog: 'billing', password: 'Redacted' });
    },
  },
  {
    name: 'env var configuration, including hooks resolved from the global object',
    env: {
      CONSOLE_LOG_JSON_NO_TIME_STAMP: 'true',
      CONSOLE_LOG_JSON_CONTEXT_KEY: 'context',
      CONSOLE_LOG_JSON_TRANSFORM_OUTPUT: 'appHooks.transform',
    },
    code: `global.appHooks = { transform: (o) => { o.hooked = true; return o; } };
      const { LoggerAdaptToConsole } = require('console-log-json');
      LoggerAdaptToConsole(${QUIET});
      console.log('configured', { a: 1 });`,
    check(logs) {
      const log = logs[0];
      assert.strictEqual(log['@timestamp'], undefined);
      assert.deepStrictEqual(log.context, { a: 1 });
      assert.strictEqual(log.hooked, true);
    },
  },
  {
    name: 'circular references and JSON auto-parsing',
    code: `const { LoggerAdaptToConsole } = require('console-log-json');
      LoggerAdaptToConsole(${QUIET});
      const obj = { name: 'test' }; obj.self = obj;
      console.log('circular', obj);
      console.log('{"event":"webhook"}');`,
    check(logs) {
      assert.strictEqual(logs[0].self, '[Circular ~]');
      assert.deepStrictEqual(logs[1]['@autoParsedJson'], { event: 'webhook' });
    },
  },
  {
    name: 'LoggerRestoreConsole restores plain output',
    code: `const { LoggerAdaptToConsole, LoggerRestoreConsole } = require('console-log-json');
      LoggerAdaptToConsole();
      LoggerRestoreConsole();
      console.log('plain text');`,
    raw: true,
    check(stdout) {
      assert.strictEqual(stdout.trim(), 'plain text');
    },
  },
];

const esmScenarios = [
  {
    name: 'ES module import',
    file: 'app.mjs',
    code: `import { LoggerAdaptToConsole, ErrorWithContext } from 'console-log-json';
      LoggerAdaptToConsole({ noStackForNonError: true });
      console.log('from esm', { ok: true });
      console.error(new ErrorWithContext('esm error', { step: 1 }));`,
    check(logs) {
      assert.strictEqual(logs.length, 2);
      assert.strictEqual(logs[0].message, 'from esm');
      assert.strictEqual(logs[0].ok, true);
      assert.ok(/app\.mjs$/.test(logs[0]['@filename']), '@filename: ' + logs[0]['@filename']);
      assert.strictEqual(logs[0]['@packageName'], 'compat-app');
      assert.strictEqual(logs[1].level, 'error');
      assert.strictEqual(logs[1].step, 1);
    },
  },
];

let failures = 0;
const scenarios = cjsScenarios.concat(supportsEsm ? esmScenarios : []);
for (const scenario of scenarios) {
  const file = path.join(appDir, scenario.file || 'app.js');
  fs.writeFileSync(file, scenario.code + '\n');
  const result = childProcess.spawnSync(process.execPath, [file], {
    cwd: appDir,
    encoding: 'utf8',
    env: Object.assign({}, cleanEnv(), scenario.env || {}),
    timeout: 30000,
  });
  try {
    assert.strictEqual(result.status, 0, 'exit code ' + result.status + '\n' + result.stderr);
    if (scenario.raw) {
      scenario.check(result.stdout);
    } else {
      const logs = result.stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            throw new Error('Not a JSON line: ' + line);
          }
        });
      scenario.check(logs);
    }
    console.log('ok   ' + scenario.name);
  } catch (err) {
    failures++;
    console.log('FAIL ' + scenario.name + '\n     ' + String(err && err.message).split('\n').join('\n     '));
    console.log('     stdout: ' + JSON.stringify(result.stdout));
  }
}

if (!supportsEsm) {
  console.log('skip ES module import (not supported on Node ' + process.versions.node + ')');
}

rmrf(appDir);
console.log((failures ? failures + ' failed' : 'all passed') + ' on Node ' + process.versions.node);
process.exit(failures ? 1 : 0);

function cleanEnv() {
  // Don't let the caller's logger config leak into the scenarios.
  const env = {};
  Object.keys(process.env).forEach((key) => {
    if (!/^CONSOLE_LOG_/.test(key)) env[key] = process.env[key];
  });
  return env;
}

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir);
}

function rmrf(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) {
      fs.readdirSync(target).forEach((entry) => rmrf(path.join(target, entry)));
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
  } catch (_) {
    /* best effort */
  }
}
