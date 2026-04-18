# console-log-json - Architecture & Knowledge Base

## What It Does

`console-log-json` is a TypeScript library that turns the global `console` into a structured JSON logger.

Call `LoggerAdaptToConsole()` once at startup and every `console.log()`, `console.error()`, `console.warn()`, `console.info()`, `console.debug()`, `console.http()`, `console.verbose()`, and `console.silly()` call is routed through the library.

The output is:

- single-line JSON by default
- enriched with metadata such as `@timestamp`, `@filename`, `@packageName`, and `@logCallStack`
- safe for circular references
- compatible with Node.js and browser-like environments
- extensible via `customOptions`, `envOptions`, `onLog`, `transformOutput`, and `redact`

This document reflects the current implementation in `5.0.0`.

## Runtime Model

The library no longer uses Winston or any other runtime logging framework.

The core logger is an internal singleton in `src/logger.ts` that:

- checks the configured log level
- builds a plain JS log object
- shapes it through `FormatErrorObject()` logic
- optionally transforms the output object
- optionally redacts configured paths on the final object
- writes directly to `process.stdout.write()`
- optionally invokes an async-safe interception callback

The main log pipeline entry point is `logUsingConsoleJson()`.

## Core Data Flow

```text
User calls console.log("msg", { data }, err)
  |
  v
LoggerAdaptToConsole() has patched console methods
  |
  v
logUsingConsoleJson(args, level, customOptions)
  |-- adds @packageName
  |-- optionally adds _loggerDebug
  |-- captures one shared Error().stack for @logCallStack and stack fallback
  |-- prefers V8 callsites for @filename when available
  |-- appends customOptions as context fragments
  |-- detects explicit { level: "warn" } override in args
  |-- extractParametersFromArguments(args)
  |     |-- strings/numbers/booleans -> message
  |     |-- Error-like objects -> errorObject
  |     |-- other objects -> extraContext
  |     |-- merges multiple context objects
  |     |-- wraps error + context into ErrorWithContext
  |
  v
Logger.log(level, message, errorObject)
  |-- enforces log level threshold
  |-- builds final info object
  |-- copies enumerable and non-enumerable Error fields
  |-- buildFormattedLogObject(info)
  |     |-- merges extraContext
  |     |-- formats stack traces
  |     |-- promotes error logs
  |     |-- adds @timestamp unless suppressed
  |     |-- auto-parses JSON message strings unless disabled
  |
  |-- optional transformOutput(parsedObject)
  |-- optional redact(paths)
  |-- serialize + colorize if enabled
  |-- writeOutput(formatted)
  |-- optional async onLog(jsonString, parsedObject)
  v
stdout
```

## Main Source Files

| File | Purpose |
|------|---------|
| `src/logger.ts` | Main implementation: console patching, argument parsing, formatting, env config, output writing, interceptors, test stdout capture helpers |
| `src/error-with-context.ts` | `ErrorWithContext` class for preserving error stacks while attaching structured context |
| `src/safe-object-assign.ts` | Safe deep merge used for context merging and duplicate-key handling |
| `src/format-stack-trace.ts` | Normalizes stack traces into a compact format and strips local package paths when possible |
| `src/get-call-stack.ts` | Reuses a stack string to compute `@logCallStack` without creating a second Error object |
| `src/get-calling-filename.ts` | Extracts the first non-internal caller filename, preferring V8 callsites and falling back to stack parsing |
| `src/get-app-root.ts` | Finds the nearest directory containing `package.json`, cached after first lookup |
| `src/get-env.ts` | Safe env var access that degrades cleanly outside Node |
| `src/env/env.ts` | Legacy no-op compatibility shim; configuration now comes from `process.env` or `envOptions` |
| `src/redact.ts` | Compiles Pino-style redact paths and applies them to the final log object |
| `src/colors/colorize.ts` | ANSI color output for local readability |
| `src/json-stringify-safe/stringify-safe.ts` | Circular-safe JSON serialization |
| `src/index.ts` | Public API barrel for supported exports |
| `index.ts` | Root package entry that re-exports `src` |

## Initialization Flow

`LoggerAdaptToConsole()` is the entry point.

At initialization time it:

1. Stores programmatic `envOptions`, `onLog`, `onLogTimeout`, and `transformOutput`.
2. Compiles `redact` paths if configured.
3. Calls `loadEnvConfig()` to cache environment-driven behavior.
4. Locates the package root and package name.
5. Sets the logger level.
6. Backs up the original console methods once.
7. Replaces console methods with wrappers that forward to `logUsingConsoleJson()`.

`LoggerRestoreConsole()` restores the original console methods from those backups.

## Environment Configuration

Environment-derived behavior is cached in module state via `loadEnvConfig()`.

That means:

- env vars are not re-read on every log call
- `envOptions` passed to `LoggerAdaptToConsole()` take precedence over `process.env`
- calling `loadEnvConfig()` again refreshes the cached config

Supported options:

| Variable | Effect |
|----------|--------|
| `CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS=true` | Suppress formatter-added newline characters |
| `CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK=true` | Keep stack formatting but suppress the final formatter newline |
| `CONSOLE_LOG_JSON_NO_TIME_STAMP=true` | Omit `@timestamp` |
| `CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE=true` | Disable structured extraction of JSON-looking message strings |
| `CONSOLE_LOG_COLORIZE=true` | Emit ANSI-colored JSON |
| `CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR=true` | Omit `@logCallStack` on non-error logs |
| `CONSOLE_LOG_JSON_NO_FILE_NAME=true` | Omit `@filename` |
| `CONSOLE_LOG_JSON_NO_PACKAGE_NAME=true` | Omit `@packageName` |
| `CONSOLE_LOG_JSON_NO_LOGGER_DEBUG=true` | Omit `_loggerDebug` when debug mode is enabled |
| `CONSOLE_LOG_JSON_CONTEXT_KEY=<key>` | Nest user context under a single top-level key instead of flattening it |

## Argument Extraction Rules

`extractParametersFromArguments()` is the input classifier.

Current behavior:

- `string`, `number`, and `boolean` arguments are concatenated into `message` with ` - ` separators
- `null` and `undefined` are removed before classification and can trigger placeholder messages
- any object with a string `message` and string `stack` is treated as an Error-like object
- other plain objects are treated as context and merged together
- if both an error and context exist, the error is wrapped in `ErrorWithContext`
- if `CONSOLE_LOG_JSON_CONTEXT_KEY` is set, user context is nested under that key while metadata fields stay at the top level
- explicit log level override is supported by passing an object whose first key is `level`

Examples:

- `console.log("login", { userId: 42 })` -> info log with merged top-level context
- `console.log({ level: "warn" }, "disk high")` -> warn log
- `console.log("failed", new Error("boom"), { jobId: 7 })` -> error log with `errCallStack` and merged context

## Metadata Capture

For each log call, `logUsingConsoleJson()` may add:

- `@packageName`
- `@filename`
- `@logCallStack`
- `_loggerDebug`
- custom option properties

Implementation details:

- package name is read from the nearest `package.json` during initialization
- `@filename` prefers V8 callsites in Node.js and falls back to parsing a shared stack string
- internal frames are skipped by function identity where possible and by module path / function-name fallback otherwise
- if a consumer bundles the library and app into one browser file, `@filename` becomes best-effort because the stack may not expose a reliable boundary between internal and external frames
- when metadata capture fails, the logger degrades rather than throwing

## Error Handling Model

`ErrorWithContext` is the mechanism for attaching structured data to errors while preserving the original error chain.

It:

- extends `Error`
- stores merged `extraContext`
- preserves nested stacks through `CaptureNestedStackTrace`
- supports wrapping an existing `ErrorWithContext` without losing earlier context

`FormatErrorObject()` then converts error information into output-friendly JSON by:

- preserving object-valued `message` under `@messageObject`
- merging `extraContext`
- moving stack text into `errCallStack`
- appending the stack message to `message`
- tagging the entry as `level: "error"`
- adding `@errorObjectName` when available through the wrapping path

## Output Formatting

`FormatErrorObject()` shapes the final payload before it is written.

Important formatting rules:

- `level` is forced to the front of the object
- `message` is placed immediately after `level`
- `@timestamp` is appended unless disabled
- empty messages become placeholder strings
- JSON-looking strings are parsed automatically unless disabled
- when auto-parse is enabled, parsed content is moved to `@autoParsedJson`
- when auto-parse is disabled, valid JSON strings are normalized back into `message`
- colorized output uses `colorJson()`
- plain output uses `jsonStringifySafe()`

## Redaction

Redaction is configured through `LoggerAdaptToConsole({ redact })`.

Current API:

```ts
redact?: string[] | {
  paths: string[];
  censor?: any; // defaults to "Redacted"
}
```

Behavior:

- paths use Pino-style object path syntax such as `password`, `headers.authorization`, `headers["x-api-key"]`, and `items[*].token`
- redact paths are compiled once at initialization rather than reparsed on every log call
- redaction runs after `transformOutput`, so transformed fields can also be redacted
- redaction mutates only the final log object, not the caller's original context objects
- invalid redact paths are ignored and redaction failures are swallowed so logging never breaks the application
- redaction is for structured fields, not arbitrary regex scrubbing of free-text `message` strings

## Output Writing

The internal `Logger.log()` method writes directly to stdout through `writeOutput()`.

Current behavior:

- if `process.stdout.write` exists, it is used
- otherwise the original `console.log` backup is used as a fallback
- formatter output may include a trailing newline, and `writeOutput()` also appends `\n`
- tests intentionally assert the current newline behavior

## Extensibility Hooks

`LoggerAdaptToConsole()` currently accepts:

```ts
{
  logLevel?: LOG_LEVEL;
  debugString?: boolean;
  customOptions?: object;
  envOptions?: Record<string, string>;
  onLog?: (jsonString: string, parsedObject: any) => void;
  onLogTimeout?: number;
  transformOutput?: (parsedObject: any) => any;
  redact?: string[] | { paths: string[]; censor?: any };
}
```

Hook behavior:

- `customOptions` are added to every log call as extra context
- `envOptions` override `process.env` for the supported config keys
- `transformOutput` receives the parsed log object after formatting and can replace or mutate it
- `transformOutput` failures fall back to the original formatted output
- `redact` runs after `transformOutput` and censors configured structured paths on the final log object
- `onLog` is invoked asynchronously after writing output
- `onLog` failures are swallowed so logging never breaks the caller

## Log Levels

Supported log levels and priorities:

| Level | Priority |
|-------|----------|
| `error` | 0 |
| `warn` | 1 |
| `info` | 2 |
| `http` | 3 |
| `verbose` | 4 |
| `debug` | 5 |
| `silly` | 6 |

Lower numeric priority means higher severity.

`Logger.log()` suppresses messages whose priority is lower than the configured threshold.

## Browser Compatibility

The package is designed to degrade cleanly outside full Node.js environments.

Current browser-safety strategy:

- console methods are polyfilled if `console` is missing
- `getEnv()` returns `undefined` when `process.env` is unavailable
- the library does not load `.env` files; callers are expected to populate `process.env` themselves if they want file-based env loading
- package root detection returns an empty string when filesystem APIs are unavailable
- filename and stack extraction fall back gracefully when V8-specific behavior is unavailable
- `@filename` should be treated as best-effort in bundled browser output, especially when the library and application share one generated file
- stdout test helpers become no-ops when `process.stdout` is missing

Browser-related behavior is covered in `test/browser-compat.test.ts` and `test/browser-real.test.ts`.

## Packaging and Build

The package publishes both CommonJS and ESM builds.

Current package layout:

- CommonJS entry: `dist/index.js`
- ESM entry: `dist/esm/index.mjs`
- Type declarations: `dist/index.d.ts` and `dist/esm/index.d.ts`
- root `index.ts` re-exports `src`

Current build pipeline from `package.json`:

- `npm run build`
  - `npm run format:prettier`
  - `npm run lint`
  - `tsc -sourcemap`
  - `npm run build:esm`
- `npm run build:esm`
  - bundles `src/index.ts` with `esbuild`
  - emits ESM declarations with `tsc -p tsconfig.esm.json --emitDeclarationOnly`

Tests run directly from TypeScript through Jest:

- `npm test` -> `jest`

## Dependencies

The package has no required runtime dependencies.

It does have one optional runtime integration:

- `source-map-support`

It is loaded with `try/catch`, so the logger still works if it is absent.

Development tooling includes TypeScript, Jest, ts-jest, Chai, Sinon, esbuild, Prettier, and TSLint.

## Public API

The supported public exports from `src/index.ts` are:

```ts
export { ErrorWithContext } from './error-with-context';
export {
  FormatErrorObject,
  GetLogLevel,
  SetLogLevel,
  LOG_LEVEL,
  LoggerAdaptToConsole,
  LoggerRestoreConsole,
  NativeConsoleLog,
  loadEnvConfig,
  logUsingConsoleJson,
  overrideStdOut,
  restoreStdOut,
} from './logger';
```

## Things To Know Before Changing Code

- `src/logger.ts` is still the monolith. Most behavior changes land there.
- `logUsingConsoleJson()` is the main entry point for adapted console methods.
- Cached env config is central to current behavior. If you add new env flags, wire them through `loadEnvConfig()`.
- Metadata capture is intentionally best-effort and must not crash the caller.
- `FormatErrorObject()` is the main output-shaping function.
- `extractParametersFromArguments()` is the main input-parsing function.
- `LoggerRestoreConsole()` depends on first-call backups stored in module scope.
- `overrideStdOut()` and `restoreStdOut()` are test utilities used heavily across the suite.
- `ARCHITECTURE.md` should stay aligned with tests and `package.json`, not just the README.
