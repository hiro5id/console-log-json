/**
 * Set an environment variable for the current test. It is restored after the test by
 * test/support/restore-env-after-each.ts (configured in jest.config.cjs).
 *
 * Use this instead of `sinon.stub(process.env, name).value(value)`. sinon applies stubs
 * with Object.defineProperty, which had no effect on process.env on Windows: the tests
 * using it failed there while passing on Linux and macOS. Plain assignment works on every
 * platform, and it is how real configuration reaches the library.
 */
const pendingRestores: (() => void)[] = [];

export function stubEnv(name: string, value: string): void {
  const hadValue = Object.prototype.hasOwnProperty.call(process.env, name);
  const originalValue = process.env[name];
  process.env[name] = value;
  pendingRestores.push(() => {
    if (hadValue && originalValue !== undefined) {
      process.env[name] = originalValue;
    } else {
      delete process.env[name];
    }
  });
}

/** Undo every stubEnv() call, newest first. */
export function restoreStubbedEnv(): void {
  while (pendingRestores.length > 0) {
    pendingRestores.pop()!();
  }
}
