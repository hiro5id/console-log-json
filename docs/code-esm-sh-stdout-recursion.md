# `code.esm.sh` Console Feedback Recursion

## Problem

`console-log-json` normally writes its final formatted output directly to `process.stdout.write(...)` when that API exists. That is the correct behavior in real Node.js because it bypasses patched `console.log(...)` wrappers and writes the final JSON string straight to stdout.

In the `code.esm.sh` playground, the runtime is browser-like but also exposes a compatibility `process.stdout.write(...)` shim. That shim is not real Node stdout. It feeds output back into the playground's console plumbing.

On top of that, browser-style hosts can also expose a saved `console.log(...)` implementation that is not a hard boundary. Even after `console-log-json` captures the "original" console method, calling it can still feed back into the patched console path.

When `LoggerAdaptToConsole()` patches `console.log(...)`, the following loop can happen:

1. Application calls `console.log(...)`
2. `console-log-json` formats the log
3. `writeOutput(...)` calls either `process.stdout.write(...)` or the saved console implementation
4. The host routes that write back through console handling
5. The patched `console.log(...)` is hit again
6. The cycle repeats until `Maximum call stack size exceeded`

## Why The Fix Is Narrow

The direct stdout path must remain intact in real Node.js. Changing that globally would risk breaking the existing contract for:

- direct JSON writes to stdout
- environments that depend on stdout semantics instead of console semantics
- tests and integrations that intentionally intercept `process.stdout.write(...)`

Because of that, the fix is intentionally limited to browser-like DOM hosts.

## Fix

`writeOutput(...)` now avoids `process.stdout.write(...)` when a real DOM-style `document` is present. In that case it falls back to the saved native console method instead.

That by itself was not enough for `code.esm.sh`, because the saved console method can still feed back into patched console handling.

The current fix therefore adds a second narrow safeguard:

- while `console-log-json` is emitting its own final output, any immediate re-entrant call back into the patched console methods is ignored
- captured console methods are invoked with the `console` receiver, instead of as detached bare functions

This preserves the existing behavior in real Node.js while preventing browser/playground feedback loops from recursively re-logging the logger's own output.

## Non-Goals

This change does **not** try to redefine runtime detection for every hybrid environment.

It deliberately does **not**:

- remove stdout writes in real Node.js
- change the public API
- rely on fragile heuristics such as function source inspection
- guess about every possible shim implementation

## Regression Coverage

The fix is covered by regression tests for:

- a Node-side simulation of a browser-like host with a fake `process.stdout.write(...)`
- a real browser bundle test that injects a fake `process.stdout.write(...)` and verifies it is ignored
- a Node-side simulation where the saved console implementation immediately feeds back into patched `console.log(...)`
- a real browser bundle test that simulates the same saved-console feedback loop

Those tests also verify the opposite case: plain Node-like execution still uses stdout.
