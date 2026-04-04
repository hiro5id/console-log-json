/**
 * Safely reads an environment variable. Returns undefined in browser or
 * any environment where process.env is not available.
 */
export function getEnv(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (_) {
    /* browser or restricted environment */
  }
  return undefined;
}
