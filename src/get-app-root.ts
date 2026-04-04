let cachedRoot: string | null = null;

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
    cachedRoot = '';
    return cachedRoot;
  }
}
