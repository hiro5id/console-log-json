import { getAppRoot } from './get-app-root';

// The filename of this library's logger module, detected once at load time.
// Used to skip internal frames — works even after minification because file paths survive in stack traces.
let loggerFilePath: string | null = null;
try {
  // __filename is the path to *this* file (get-calling-filename.ts/js).
  // The logger pipeline files are in the same directory.
  if (typeof __filename !== 'undefined') {
    const lastSep = __filename.lastIndexOf('/');
    const lastSepWin = __filename.lastIndexOf('\\');
    const sep = Math.max(lastSep, lastSepWin);
    loggerFilePath = sep >= 0 ? __filename.substring(0, sep) : null;
  }
} catch (_) {
  /* __filename not available (e.g. ESM or browser) */
}

// Fallback patterns for when __filename is not available (browser/ESM).
// These match function names and will work in unminified code.
const FALLBACK_PATTERNS = [/logUsingWinston/, /LoggerAdaptToConsole\.console\./, /getCallingFilename/, /getCallStack/];

/**
 * Extract the calling filename from a stack trace string.
 * Finds the first frame that is NOT from this library, making it resilient to
 * minification or inlining that changes the number of internal frames.
 */
export function getCallingFilenameFromStack(stack: string): string | null {
  const lines = stack.split('\n');

  // Skip line 0 (the "Error" or "Error: message" line), then search "at" frames
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes('at ')) {
      continue;
    }
    // Skip frames that belong to this library
    if (isInternalFrame(line)) {
      continue;
    }
    let name = extractFilenameFromFrame(line);
    if (name) {
      name = stripAppRoot(name);
      return name;
    }
  }

  return null;
}

/**
 * Original implementation using V8 callsites API.
 * Kept for backward compatibility but prefer getCallingFilenameFromStack for performance.
 */
export function getCallingFilename(): string | null {
  try {
    const callsites = require('./callsites/get-callsites').default; // tslint:disable-line:no-var-requires
    const callsitesList = callsites();
    const callsite = callsitesList[3];
    let name: string | null = callsite.getFileName();
    if (name) {
      name = stripAppRoot(name);
    }
    return name;
  } catch (_) {
    return null;
  }
}

function isInternalFrame(frameLine: string): boolean {
  // Primary: match on this library's directory path (survives minification)
  if (loggerFilePath && frameLine.includes(loggerFilePath)) {
    return true;
  }
  // Fallback: match on function names (works in browser/ESM but not after minification)
  for (const pattern of FALLBACK_PATTERNS) {
    if (pattern.test(frameLine)) {
      return true;
    }
  }
  return false;
}

function stripAppRoot(name: string): string {
  const root = getAppRoot();
  if (root) {
    try {
      const path = require('path'); // tslint:disable-line:no-var-requires
      name = name.replace(path.join(root, '..'), '');
    } catch (_) {
      /* path module not available */
    }
  }
  return name;
}

function extractFilenameFromFrame(frameLine: string): string | null {
  // Match "at functionName (filepath:line:col)" or "at filepath:line:col"
  const matchWithParens = frameLine.match(/\((.+?):\d+:\d+\)/);
  if (matchWithParens) {
    return matchWithParens[1];
  }
  const matchWithoutParens = frameLine.match(/at\s+(.+?):\d+:\d+/);
  if (matchWithoutParens) {
    return matchWithoutParens[1];
  }
  return null;
}
