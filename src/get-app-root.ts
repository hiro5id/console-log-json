let cachedRoot: string | null = null;
// require() can become available after startup (the ESM build on older Node loads it
// asynchronously), so a failed lookup is retried a bounded number of times before the
// empty result is cached.
const MAX_FAILED_LOOKUPS = 50;
let failedLookups = 0;

/**
 * Returns the project root path, or empty string if it cannot be determined.
 * In Node.js: walks up from process.cwd() looking for package.json.
 * In browser: returns empty string (path stripping is skipped).
 */
export function getAppRoot(): string {
  if (cachedRoot !== null) {
    return cachedRoot;
  }
  try {
    if (typeof process === 'undefined' || typeof require === 'undefined') {
      cachedRoot = '';
      return cachedRoot;
    }
    const fs = require('fs');
    const path = require('path');
    let dir: string = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        cachedRoot = dir;
        return cachedRoot;
      }
      dir = path.dirname(dir);
    }
    cachedRoot = process.cwd();
    return cachedRoot;
  } catch (_) {
    failedLookups += 1;
    if (failedLookups >= MAX_FAILED_LOOKUPS) {
      cachedRoot = '';
    }
    return '';
  }
}

/**
 * The directory containing the project root, in the platform's own path format,
 * or empty string when unknown. Paths are reported relative to this directory,
 * so they start with the project folder name (e.g. "my-app/src/index.ts").
 */
export function getAppRootParentDir(): string {
  return getParentDir(getAppRoot());
}

/** Exported for tests. Parent directory of `root`, matching path.join(root, '..'). */
export function getParentDir(root: string): string {
  const lastSeparator = Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\'));
  if (lastSeparator < 0) {
    return '';
  }

  const parent = root.substring(0, lastSeparator);
  // Same result as path.join(root, '..') for a project directly under a filesystem
  // root: "/app" -> "/", "C:\\app" -> "C:\\" (keep the trailing separator).
  if (parent === '' || /^[A-Za-z]:$/.test(parent)) {
    return root.substring(0, lastSeparator + 1);
  }
  return parent;
}
