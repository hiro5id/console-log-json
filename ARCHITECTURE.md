# console-log-json - Architecture & Knowledge Base

## What It Does

A drop-in replacement for Node.js `console.log()` that outputs structured, single-line JSON. Designed for log ingestion services like LogDNA/OpenSearch. You call `LoggerAdaptToConsole()` once at startup, and from that point every `console.log/error/warn/info/debug/verbose/http/silly` call produces JSON output with metadata (timestamps, filenames, package name, call stacks).

**Version:** 3.1.1 | **License:** MIT | **Node:** >= 10

## Core Data Flow

```
User calls console.log("msg", {data}, err)
  |
  v
LoggerAdaptToConsole() has replaced console.log with a wrapper
  |
  v
logUsingWinston(args, level, customOptions)        [logger.ts:427]
  |-- pushes @packageName, @filename, @logCallStack into args
  |-- pushes customOptions as individual key/value args
  |-- calls findExplicitLogLevelAndUseIt() to detect {level: "error"} in args
  |-- calls extractParametersFromArguments(args)    [logger.ts:593]
  |     |-- separates: strings/numbers -> message, objects with .stack -> errorObject, other objects -> extraContext
  |     |-- merges multiple objects via safeObjectAssign()
  |     |-- wraps error+context into ErrorWithContext if both present
  |     `-- returns { message, errorObject }
  |-- calls supressDetailsIfSelected() to strip fields per env vars
  `-- calls Logger.log(level, message, errorObject)
        |
        v
  Winston printf formatter -> FormatErrorObject()  [logger.ts:108]
    |-- flattens message if it's an object
    |-- merges extraContext from ErrorWithContext
    |-- formats stack traces via FormatStackTrace.toNewLines()
    |-- reorders JSON: level -> message -> data -> @timestamp
    |-- auto-parses JSON strings in messages
    |-- applies colorization if CONSOLE_LOG_COLORIZE=true
    `-- returns JSON string for stdout
```

## File-by-File Breakdown

### Source Files (`src/`)

| File | Lines | Purpose |
|------|-------|---------|
| **logger.ts** | 680 | Core module. Contains `LoggerAdaptToConsole`, `logUsingWinston`, `extractParametersFromArguments`, `FormatErrorObject`, `LOG_LEVEL` enum, console backup/restore, stdout override for testing |
| **error-with-context.ts** | 44 | `ErrorWithContext` class - extends Error to carry extra contextual metadata. Merges nested error contexts. |
| **safe-object-assign.ts** | 84 | Deep merge with circular reference detection, conflict resolution (prefix `_` on duplicate keys), string property merging |
| **format-stack-trace.ts** | 22 | `FormatStackTrace` class - parses V8 stack traces, splits on `"    at"`, filters out console-log-json internal frames, strips absolute paths |
| **get-calling-filename.ts** | ~30 | Uses V8 stack trace API to discover the caller's filename |
| **get-call-stack.ts** | ~30 | Extracts and formats the full call stack |
| **capture-nested-stack-trace.ts** | ~20 | Preserves original error stack when wrapping errors |
| **sort-object.ts** | ~15 | Alphabetically sorts object properties |
| **to-one-line.ts** | ~10 | Strips newlines from strings |
| **new-line-character.ts** | ~15 | Returns `\n` or empty string based on env vars |
| **colors/colorize.ts** | ~100 | ANSI color mapping for JSON output, regex-based key colorization |
| **env/env.ts** | ~30 | Loads `.env` via dotenv |
| **callsites/get-callsites.ts** | ~30 | V8 `prepareStackTrace` API wrapper |
| **callsites/callsite.types.ts** | ~50 | TypeScript interface for V8 CallSite objects |
| **json-stringify-safe/stringify-safe.ts** | ~80 | JSON.stringify with circular reference handling (`[Circular ~.path]`) |

### Key Architectural Decisions

1. **Console method replacement pattern** (`logger.ts:293-371`): All 8 console methods are backed up, then replaced with wrappers that call `logUsingWinston()`. Originals are stored in module-scoped variables for `LoggerRestoreConsole()`.

2. **Argument classification** (`logger.ts:593-666`): Arguments are classified by type:
   - `string | number` -> concatenated into `message` with ` - ` separator
   - Object with `.stack` property -> treated as Error
   - Other objects -> merged into `extraContext`

3. **Winston as the output engine** (`logger.ts:231-235`): A single Winston logger with one Console transport and a custom `printf` formatter (`FormatErrorObject`).

4. **Module-level state**: The Winston Logger instance, console backups, `packageName`, and `logParams` are all module-scoped singletons. This means `LoggerAdaptToConsole()` is called once globally.

5. **Auto-generated barrel exports**: The `prebuild` script uses `create-ts-index` (cti) to auto-generate all `index.ts` barrel files.

## Environment Variables

| Variable | Effect |
|----------|--------|
| `CONSOLE_LOG_COLORIZE=true` | ANSI-colored JSON output |
| `CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE=true` | Don't extract JSON from message strings |
| `CONSOLE_LOG_JSON_NO_FILE_NAME=true` | Omit `@filename` |
| `CONSOLE_LOG_JSON_NO_PACKAGE_NAME=true` | Omit `@packageName` |
| `CONSOLE_LOG_JSON_NO_TIME_STAMP=true` | Omit `@timestamp` |
| `CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR=true` | Omit `@logCallStack` for non-errors |
| `CONSOLE_LOG_JSON_NO_LOGGER_DEBUG=true` | Omit `_loggerDebug` |
| `CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS=true` | Remove all newlines from output |
| `CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK=true` | Newlines only in stack traces |

## Public API

```typescript
// Initialize - call once at startup
LoggerAdaptToConsole(options?: {
  logLevel?: LOG_LEVEL;
  debugString?: boolean;
  customOptions?: object;  // key/values added to every log entry
})

// Restore original console methods
LoggerRestoreConsole()

// Log level control
GetLogLevel(): string
SetLogLevel(level: string): void

// Call native console.log even after adaptation
NativeConsoleLog(...args: any[]): void

// Error wrapper for attaching context to errors
new ErrorWithContext(error: Error | string, extraContext?: object)

// Formatting (used internally, but exported)
FormatErrorObject(object: any): string

// Test utilities
overrideStdOut(): { originalWrite, outputText: string[] }
restoreStdOut(originalWrite): void
```

## Build & Test

- **Build**: `npm run build` (prettier -> tslint -> tsc)
- **Test**: `npm test` (mocha on compiled JS in `dist/test/`)
- **Publish**: `npm run interactive-publish` (uses `np`)
- **TypeScript**: ES2019 target, CommonJS modules, strict mode
- **Tests**: Mocha + Chai + Sinon, ~100+ cases in `test/logger.test.ts`

## Dependencies

| Package | Why |
|---------|-----|
| `winston` 3.12.0 | Logging engine with transport system and log levels |
| `app-root-path` 3.1.0 | Find project root for path normalization in stack traces |
| `dotenv` 16.4.5 | Load `.env` files |
| `source-map-support` ^0.5.21 | Map compiled JS stack traces back to TypeScript |

## Things to Know Before Making Changes

- **logger.ts is the monolith**: Most logic lives in this one 680-line file. The other source files are small focused utilities.
- **Console backup pattern**: The backup variables (`consoleErrorBackup`, etc.) are module-scoped and only set once (null-checked). `LoggerRestoreConsole()` reverses the swap.
- **FormatErrorObject is the output formatter**: This is the Winston `printf` function - it shapes the final JSON. Any output changes go here.
- **extractParametersFromArguments is the input parser**: This classifies console arguments by type. Any input handling changes go here.
- **Tests capture stdout**: Tests use `overrideStdOut()`/`restoreStdOut()` to intercept and inspect output. Tests run against compiled JS (`dist/test/`), not TypeScript directly.
- **Barrel exports are auto-generated**: Don't manually edit `src/index.ts` - it's regenerated by `prebuild`.
- **Environment variables are read at call time**: Most env vars are checked in `FormatErrorObject` and `supressDetailsIfSelected` on every log call (not cached at init).
