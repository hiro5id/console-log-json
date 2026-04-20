# Code Structure Conventions

This document is the maintainer-facing guide for how code in `console-log-json` should be organized going forward.

The goal is not abstraction for its own sake. The goal is to keep behavior obvious, side effects contained, and changes easy to review without having to re-read the whole codebase.

## Project Layout

### Public API boundary

- `src/index.ts` is the public barrel.
- Export only supported consumer-facing API from there.
- Internal helpers should stay internal unless there is a clear user-facing need to expose them.

### Logger runtime boundary

- `src/logger.ts` owns the main logger runtime and public logger API.
- It is the orchestration layer: initialization, runtime state, console patching flow, package-name buffering, and exported helpers such as `LoggerAdaptToConsole()` and `logUsingConsoleJson()`.
- It should not re-absorb parsing, formatting, env normalization, or console state machinery that now live in focused helper modules.

### Logger internal support modules

Put logger-only helper code under `src/logger-support/`.

Current responsibilities:

- `runtime-bootstrap.ts`: startup side effects such as source-map support installation and console polyfill / console type augmentation.
- `types.ts`: logger-specific types, enums, env-var names, and small shared constants.
- `config.ts`: env parsing, option normalization, and resolved configuration assembly.
- `argument-parsing.ts`: classification of raw console arguments into message, error object, and structured context.
- `formatting.ts`: final log-object shaping and serialization formatting decisions.
- `console-state.ts`: captured console backups, stdout/native console writing, and internal write guards.

Rule of thumb:

- If the code is logger-specific but not part of the public runtime orchestration, it probably belongs in `src/logger-support/`.

### Cross-cutting reusable modules

Keep reusable domain helpers in top-level `src/` modules when they are meaningful outside the logger orchestrator itself.

Examples:

- `src/error-with-context.ts`
- `src/redact.ts`
- `src/format-stack-trace.ts`
- `src/get-calling-filename.ts`
- `src/safe-object-assign.ts`

These should stay small, focused, and reusable.

## Conventions

### 1. Keep side effects isolated

Side-effectful code should live at obvious boundaries.

Examples:

- console polyfills
- source-map support installation
- global console patching
- stdout interception for tests

Do not hide side effects inside utility modules that otherwise look pure.

### 2. Keep config flow explicit

Configuration should move through one normalization path.

That means:

- parse environment variables in one place
- resolve top-level options and env-style overrides in one place
- avoid new direct `process.env` reads deep inside behavior code unless there is a strong compatibility reason

If a formatting or parsing function depends on configuration, prefer passing normalized config into it rather than letting it reach into global state on its own.

### 3. Prefer focused helpers over mega-functions

When a function is doing several distinct jobs, split it into named helpers that describe the steps.

Good examples:

- `appendPackageNameMetadata(...)`
- `appendRuntimeCustomOptions(...)`
- `applyStructuredRedaction(...)`

The names should explain the behavior without requiring the reader to mentally execute the implementation first.

### 4. Keep shared mutable state with a single owner

Some runtime state is unavoidable in this library because it patches global console behavior.

Examples:

- captured console backups
- current logger config
- pending logs while package name is still resolving

When state is necessary:

- keep ownership clear
- keep writes centralized
- avoid duplicating state across modules

Pure helpers should receive inputs and return outputs instead of mutating shared state directly.

### 5. Split by responsibility, not by file size alone

File length is a smell, not the actual rule.

Create or extend a separate module when code introduces a distinct responsibility such as:

- option normalization
- argument parsing
- output formatting
- console runtime state
- browser/Node bootstrap behavior

Do not split tightly coupled logic into tiny files just to make a line-count target look better.

### 6. Prefer descriptive names over clever abstractions

This project is infrastructure code. Clarity matters more than terseness.

Prefer:

- `suppressMetadataIfConfigured`
- `resolveLoggerAdaptToConsoleOptions`
- `shouldBufferUntilPackageNameResolves`

Avoid generic names like `handle`, `process`, `run`, or `doThing` when a more specific name is possible.

### 7. Preserve behavior first, then improve structure

This library is widely consumed and compatibility matters.

When refactoring:

- preserve public API shape unless a breaking change is intentional
- preserve output semantics unless a behavioral fix is deliberate
- add or update tests for externally visible behavior

If a refactor also fixes a bug, capture that with a regression test.

### 8. Keep browser and Node compatibility visible

This library supports both Node.js and browser-like environments.

Do not bury environment compatibility assumptions deep in code paths.

When adding Node-specific or browser-specific behavior:

- guard it explicitly
- keep fallback behavior obvious
- prefer boundary modules for runtime detection

### 9. Keep documentation aligned with code structure

When moving responsibilities between modules, update:

- `ARCHITECTURE.md`
- this file
- `README.md` if the user-facing behavior or configuration surface changed

## Practical Rules For Future Changes

### When adding a new config option

- Add the type in `src/logger-support/types.ts` if it is part of the logger option/config surface.
- Add normalization and env resolution in `src/logger-support/config.ts`.
- Thread the normalized value into the runtime or helper that actually uses it.
- Add tests covering direct option use and, if supported, env-var use.
- Update `README.md`.

### When adding a new output-formatting rule

- Put the shaping logic in `src/logger-support/formatting.ts` unless it truly belongs to another focused module.
- Keep serialization behavior separate from runtime console patching logic.
- Add tests for the visible JSON output.

### When adding a new console-argument behavior

- Put argument classification logic in `src/logger-support/argument-parsing.ts`.
- Keep `src/logger.ts` limited to orchestration steps around that parsing.
- Add tests showing the input call shape and the emitted JSON.

### When adding runtime patching or stdout behavior

- Keep it in `src/logger.ts` or `src/logger-support/console-state.ts`.
- Treat recursion, fake stdout implementations, and browser shims as first-class compatibility concerns.
- Add regression coverage for host-specific behavior when possible.

## Review Checklist

Before merging structural work, check:

- Is the public API still exposed only through the intended barrel?
- Does each module have one clear responsibility?
- Are side effects isolated and obvious?
- Is config flowing through normalized paths instead of ad hoc reads?
- Are externally visible behavior changes covered by tests?
- Are `README.md` and `ARCHITECTURE.md` still accurate?

