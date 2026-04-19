# Changelog

## In Development

### Security Fixes
- Upgraded dev-dependency np package version to 11.1.0 to get security fixes

## 6.2.1

### Bug Fixes

- **Logging a bare `Error` no longer prefixes the message with a dangling hyphen.** Calls like `console.error(new Error('bang'))` and `console.log(new Error('bang'))` now emit `message: "bang"` instead of `message: "  - bang"`.

### Tests

- **Added regression coverage for bare-error logging without extra context.** Updated error-only expectations and added an explicit end-to-end console-path test to ensure the emitted `message` stays clean when no leading string message is provided.

## 6.2.0

### Bug Fixes

- **Buffered startup logs now preserve original caller metadata.** When an early log is held briefly for async package-name lookup, its `@filename` and `@logCallStack` are captured at the original call site instead of being recomputed later during flush.
- **Node ESM caller detection now skips packaged library frames more reliably.** `@filename` no longer falls back to `node_modules/console-log-json/dist/esm/index.mjs` in the reported startup case when the first real external caller is the consumer's app entry file.
- **Bare `Error` stack headers are now stripped from non-error call stacks.** `@logCallStack` no longer degrades to a useless literal `"Error"` when the runtime emits a header line without a trailing colon.
- **Internal helper frames are omitted from `@logCallStack`.** Non-error call stacks now start at the consumer-visible caller instead of internal helpers like `captureFileInfo(...)`, `emitConsoleJsonLog(...)`, or `logUsingConsoleJson(...)`.

### Tests

- **Added end-to-end regression coverage for the reported Node ESM startup case.** The test suite now verifies `@packageName`, `@filename`, and `@logCallStack` behavior with a temporary ESM consumer setup that mirrors the installed package layout under `node_modules/console-log-json/dist/esm/index.mjs`.
- **Added stack-parser regressions for packaged ESM frames and internal helper trimming.** Browser/stack compatibility tests now cover installed-package frame skipping, bare `Error` headers, and removal of leading internal logger helper frames from `@logCallStack`.

## 6.0.0

### Breaking Changes

- **Automatic `.env` loading has been removed.** The library no longer reads `.env` files or depends on `dotenv`, even optionally. Configuration now comes only from existing `process.env` values or `LoggerAdaptToConsole({ envOptions })`.
- **`logUsingWinston` has been renamed to `logUsingConsoleJson`.** If you were importing or referencing the old helper directly, update to the new name.

### New Features

- **Built-in structured redaction.** `LoggerAdaptToConsole()` now accepts a Pino-style `redact` option:
  - shorthand array form: `redact: ['password', 'headers.authorization', 'items[*].token']`
  - object form with custom censor: `redact: { paths: [...], censor: 'MASKED' }`
- **Redaction runs on the final output object.** It applies after `transformOutput`, before serialization/write, and `onLog` receives the redacted result.
- **Minification-resistant caller detection.** `@filename` now prefers V8 callsites, skips internal logger frames by function identity where possible, and falls back to stack parsing only when needed.

### Improvements

- **Jest replaced Mocha.** The test runner is now Jest via `ts-jest`, with a new `jest.config.cjs` and TypeScript configured for Jest globals.
- **Safer browser/bundled filename behavior.** Documentation now explicitly treats `@filename` as best-effort when a consumer bundles the library and their app into a single browser file.
- **No more manual `.env` scanning logic.** The legacy `Env.loadDotEnv()` implementation is now a no-op compatibility shim instead of touching the filesystem.
- **Logging pipeline cleanup.** Internal naming and structure were updated to match the current architecture:
  - `logUsingConsoleJson` replaces stale Winston naming
  - final output shaping, transform hooks, redaction, and serialization are now separated more clearly
- **Test suite cleanup.** Removed confusing no-op `await console.*(...)` usage, converted the helper stack-format test to assertions instead of console output, and added targeted coverage for:
  - reserved `message` handling through the real `console.log(...)` path
  - fallback-pattern skipping in browser-style stack parsing
  - callsite-based filename detection
  - structured redaction behavior
- **Stronger configuration coverage.** Added an audit test to ensure every documented `CONSOLE_LOG_*` setting in `README.md` is referenced by the test suite.
- **More deterministic permutation coverage.** Added a table-driven test that exercises permutations of string messages, errors, one or more context objects, and explicit `{ level: ... }` overrides and asserts a normalized final payload.

### Follow-up Behavior Changes

- **Reserved `message` handling is now consistent.**
  - `console.log('dude', { message: 'hi there' })` now produces `message: "dude - hi there"`
  - object-valued `message` is preserved under `@messageObject` instead of being flattened into top-level keys
  - when only `message: { ... }` is provided, the canonical `message` field remains present with the usual placeholder text

### Bug Fixes

- **`@packageName` now works in Node ESM startup paths.** The logger no longer relies solely on `require(...)` to discover `package.json`, so `LoggerAdaptToConsole()` in `"type": "module"` projects no longer emits the misleading `"<not-yet-set> Please await..."` placeholder.
- **Early logs are buffered while async package-name lookup completes.** Startup logs emitted immediately after `LoggerAdaptToConsole()` are now replayed once package-name resolution finishes, instead of racing initialization.
- **Redaction no longer mutates caller-owned input objects.** Sensitive fields are still redacted in the final emitted log object, but the original application objects passed to `console.log(...)` remain unchanged.

### Documentation

- **`ARCHITECTURE.md` was rewritten and updated** to reflect the real implementation instead of the older Winston-based design.
- **`README.md` now documents**:
  - Jest-based contributor/test setup
  - no automatic `.env` loading
  - best-effort `@filename` semantics in bundled browsers
  - the new `redact` API with examples and guidance

## 4.0.0

### Breaking Changes

- **Removed `winston` dependency.** The logging engine is now a lightweight native implementation. If you were importing Winston-specific types or relying on Winston transport behavior, this will affect you. The public API (`LoggerAdaptToConsole`, `console.log`, etc.) is unchanged.
- **Removed `app-root-path` dependency.** Replaced with a built-in project root detector. The `@filename` and stack trace path stripping behavior is identical.
- **`dotenv` and `source-map-support` are now optional dependencies.** They will still be installed by default, but if installation fails (e.g. in restricted environments), the library works without them.
- **Compilation target lowered from `es2019` to `es2017`.** This broadens browser and Node.js compatibility but should not affect consumers.
- **Barrel exports restricted to public API only.** Internal helpers like `getAppRoot`, `getEnv`, `sortObject`, `ToOneLine`, `safeObjectAssign`, `FormatStackTrace`, `NewLineCharacter`, `jsonStringifySafe`, `colorJson`, `CaptureNestedStackTrace`, and `callsites` are no longer exported from the package root. If you were importing these directly from `console-log-json`, import them from their specific file paths instead (e.g. `console-log-json/dist/src/safe-object-assign`).

### New Features

- **Zero required runtime dependencies.** The library is fully self-contained.
- **Browser compatible.** Works in Chrome, Firefox, Safari, and Edge via webpack, vite, esbuild, or any modern bundler. Node-specific features (`@filename`, `.env` loading) degrade gracefully.
- **`envOptions` parameter.** Configure the logger programmatically without `process.env`. Accepts the same variable names as the environment variables. Ideal for browser environments.
  ```js
  LoggerAdaptToConsole({
    envOptions: {
      CONSOLE_LOG_JSON_NO_FILE_NAME: 'true',
      CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR: 'true',
    }
  });
  ```
- **`onLog` interceptor.** Receive every log entry asynchronously after it's written. Useful for forwarding logs to a backend, analytics service, or error tracker. Crash-safe and non-blocking.
  ```js
  LoggerAdaptToConsole({
    onLog: (jsonString, parsedObject) => {
      navigator.sendBeacon('/api/logs', jsonString);
    }
  });
  ```
- **`transformOutput` hook.** Modify the log object before it's written. Rename fields, add properties, or reshape the output to match your log aggregator's schema. Falls back to original output if the callback throws.
  ```js
  LoggerAdaptToConsole({
    transformOutput: (obj) => {
      obj.status = obj.level;
      delete obj.level;
      return obj;
    }
  });
  ```
- **`CONSOLE_LOG_JSON_CONTEXT_KEY` option.** Nest all user-provided context properties under a single key instead of flattening them to the top level. Keeps the top-level JSON schema predictable for DataDog filters, OpenSearch index mappings, etc.
  ```js
  LoggerAdaptToConsole({
    envOptions: { CONSOLE_LOG_JSON_CONTEXT_KEY: 'context' }
  });
  ```
- **ESM build.** Ships both CommonJS (`dist/index.js`) and ESM (`dist/esm/index.mjs`) entry points. Modern bundlers automatically pick the ESM version for tree-shaking.
- **Boolean parameter support.** `console.log('active', false)` now correctly includes `false` in the message instead of silently dropping it.

### Bug Fixes

- **`filterNullOrUndefinedParameters` skipped adjacent nulls.** `forEach` + `splice` shifted indices; fixed by iterating backwards.
- **`FormatErrorObject` crashed when `message` was an object.** Fixed by deleting `message` before merge and adding `typeof` guards.
- **`ErrorWithContext(null, 'string')` crashed.** `typeof null === 'object'` caused `null.message` access; fixed by adding null guard.
- **`Env.loadDotEnv()` had a dead branch.** `.length < 0` is always false; fixed to `.length > 0`.
- **`ifEverythingFailsLogger` could throw into the caller's code.** Now silently catches all errors so logging failures never crash the application.

### Performance Improvements

- **Single Error object per log call** (down from two). `getCallingFilename` now parses the filename from the shared stack string instead of creating a separate Error via the V8 callsites API.
- **No more `Error.prepareStackTrace` global mutation.** Eliminated the race condition hazard in the logging hot path.
- **Environment variables cached at init time.** Reduces ~10 `getEnv()` calls per log to zero.
- **Pre-compiled regex** for stack message extraction.
- **`safeObjectAssign` uses `deepClone` with a visited-object Map** instead of `JSON.parse(jsonStringifySafe(...))`. Eliminates double serialization.
- **`sortObject` optimized** to sort keys directly without intermediate arrays.
- **JSON auto-parse skipped for non-JSON messages.** A quick first-character check avoids the `try { JSON.parse() } catch` overhead on every log.
- **`NewLineCharacter` cached** after first call.
- **Stack trace capture skipped entirely** when both `CONSOLE_LOG_JSON_NO_FILE_NAME` and `CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR` are enabled. Eliminates the most expensive operation for high-throughput logging.
- **Depth limits** added to `safeObjectAssign` (50 levels) and `findNonConflictingKeyInTarget` (20 iterations) to prevent stack overflow on deeply nested objects.

### Migration from v3

1. **Install the new version:**
   ```bash
   npm install console-log-json@4
   ```

2. **No code changes needed** if you only use the public API (`LoggerAdaptToConsole`, `console.log`, `ErrorWithContext`, etc.). The drop-in behavior is identical.

3. **If you imported internal helpers** from `console-log-json` (e.g. `safeObjectAssign`, `sortObject`, `FormatStackTrace`), update your imports to use the deep path:
   ```js
   // Before (v3)
   import { safeObjectAssign } from 'console-log-json';

   // After (v4)
   import { safeObjectAssign } from 'console-log-json/dist/src/safe-object-assign';
   ```

4. **If you depended on Winston types or transports**, those are gone. The library no longer uses Winston internally.

5. **`dotenv` and `source-map-support`** are now optional. If you need `.env` file loading, ensure `dotenv` is installed in your project. If you need TypeScript source map support in stack traces, ensure `source-map-support` is installed.
