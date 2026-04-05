# Changelog

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
