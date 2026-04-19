# `code.esm.sh` Fake `stdout` Recursion

## Problem

`console-log-json` normally writes its final formatted output directly to `process.stdout.write(...)` when that API exists. That is the correct behavior in real Node.js because it bypasses patched `console.log(...)` wrappers and writes the final JSON string straight to stdout.

In the `code.esm.sh` playground, the runtime is browser-like but also exposes a compatibility `process.stdout.write(...)` shim. That shim is not real Node stdout. It feeds output back into the playground's console plumbing.

When `LoggerAdaptToConsole()` patches `console.log(...)`, the following loop can happen:

1. Application calls `console.log(...)`
2. `console-log-json` formats the log
3. `writeOutput(...)` calls `process.stdout.write(...)`
4. The playground shim routes that write back through console handling
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

This preserves the existing behavior in real Node.js while preventing browser/playground stdout shims from causing recursive logging.

## Non-Goals

This change does **not** try to redefine runtime detection for every hybrid environment.

It deliberately does **not**:

- remove stdout writes in real Node.js
- change the public API
- rely on fragile heuristics such as function source inspection
- guess about every possible shim implementation

## Regression Coverage

The fix is covered by two regression tests:

- a Node-side simulation of a browser-like host with a fake `process.stdout.write(...)`
- a real browser bundle test that injects a fake `process.stdout.write(...)` and verifies it is ignored

Those tests also verify the opposite case: plain Node-like execution still uses stdout.
