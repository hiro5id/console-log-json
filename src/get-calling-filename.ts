import { CallSite } from './callsites';
import callsites from './callsites/get-callsites';
import { getCallStack } from './get-call-stack';

type AnyFunction = (...args: any[]) => any;

// Used to skip internal frames. File paths survive minification in Node/ESM builds,
// while function identity helps when library helpers are bundled into one file.
const internalModuleDirs = detectInternalModuleDirs();
const internalCallerFunctions = new Set<AnyFunction>();
const INTERNAL_PATH_HINTS = ['/node_modules/console-log-json/', '/console-log-json/dist/', '/console-log-json/src/'];

// Fallback patterns for when __filename is not available (browser/ESM).
// These match function names and will work in unminified code.
const FALLBACK_PATTERNS = [/logUsingConsoleJson/, /LoggerAdaptToConsole\.console\./, /getCallingFilename/, /getCallStack/];

registerInternalCallerFunction(getCallingFilename);
registerInternalCallerFunction(getCallStack);

/**
 * Register a function as an internal logger helper so V8 callsites can skip it
 * by identity even if all code is bundled into one file.
 */
export function registerInternalCallerFunction(fn: AnyFunction): void {
  internalCallerFunctions.add(fn);
}

/**
 * Prefer V8 callsites in Node.js because they survive minification better than
 * function-name regexes. Fall back to stack parsing elsewhere.
 */
export function getCallingFilename(stack?: string): string | null {
  const fromCallsites = getCallingFilenameFromCallsites();
  if (fromCallsites) {
    return fromCallsites;
  }

  return getCallingFilenameFromStack(stack ?? new Error().stack ?? '');
}

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

function getCallingFilenameFromCallsites(): string | null {
  try {
    const callsiteList = callsites();
    for (const callsite of callsiteList) {
      if (isInternalCallsite(callsite)) {
        continue;
      }

      const fileName = normalizeCapturedFileName(callsite.getFileName());
      if (fileName) {
        return stripAppRoot(fileName);
      }
    }
  } catch (_) {
    return null;
  }

  return null;
}

function isInternalCallsite(callsite: CallSite): boolean {
  const fn = callsite.getFunction();
  if (fn && internalCallerFunctions.has(fn)) {
    return true;
  }

  const fileName = normalizeCapturedFileName(callsite.getFileName());
  if (fileName && isInternalFilePath(fileName)) {
    return true;
  }

  const functionLabel = `${callsite.getFunctionName() || ''} ${callsite.getMethodName() || ''}`;
  for (const pattern of FALLBACK_PATTERNS) {
    if (pattern.test(functionLabel)) {
      return true;
    }
  }

  return false;
}

function isInternalFrame(frameLine: string): boolean {
  if (isInternalFilePath(frameLine)) {
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

function isInternalFilePath(text: string): boolean {
  const normalizedText = normalizeSlashes(text);
  for (const dir of internalModuleDirs) {
    if (normalizedText.includes(dir)) {
      return true;
    }
  }

  for (const hint of INTERNAL_PATH_HINTS) {
    if (normalizedText.includes(hint)) {
      return true;
    }
  }

  return false;
}

function detectInternalModuleDirs(): string[] {
  const dirs = new Set<string>();

  try {
    if (typeof __filename !== 'undefined') {
      const dir = getDirectoryName(__filename);
      if (dir) {
        dirs.add(dir);
      }
    }
  } catch (_) {
    /* __filename not available */
  }

  const importMetaPath = tryGetImportMetaPath();
  if (importMetaPath) {
    const dir = getDirectoryName(importMetaPath);
    if (dir) {
      dirs.add(dir);
    }
  }

  return Array.from(dirs);
}

function tryGetImportMetaPath(): string | null {
  try {
    const importMetaUrl = (0, eval)('import.meta.url') as string; // tslint:disable-line:no-eval
    if (!importMetaUrl || typeof importMetaUrl !== 'string' || !importMetaUrl.startsWith('file://')) {
      return null;
    }
    return fileUrlToPath(importMetaUrl);
  } catch (_) {
    return null;
  }
}

function fileUrlToPath(fileUrl: string): string | null {
  try {
    const parsed = new URL(fileUrl);
    let pathname = decodeURIComponent(parsed.pathname);
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      pathname = pathname.substring(1);
    }
    return normalizeSlashes(pathname);
  } catch (_) {
    return null;
  }
}

function getDirectoryName(filePath: string): string | null {
  const normalized = normalizeSlashes(filePath);
  const lastSep = normalized.lastIndexOf('/');
  if (lastSep < 0) {
    return null;
  }
  return normalized.substring(0, lastSep);
}

function stripAppRoot(name: string): string {
  if (name.startsWith('/')) {
    return name.substring(1);
  }
  return name;
}

function extractFilenameFromFrame(frameLine: string): string | null {
  // Match "at functionName (filepath:line:col)" or "at filepath:line:col"
  const matchWithParens = frameLine.match(/\((.+?):\d+:\d+\)/);
  if (matchWithParens) {
    return normalizeCapturedFileName(matchWithParens[1]);
  }
  const matchWithoutParens = frameLine.match(/at\s+(.+?):\d+:\d+/);
  if (matchWithoutParens) {
    return normalizeCapturedFileName(matchWithoutParens[1]);
  }
  return null;
}

function normalizeCapturedFileName(fileName: string | null): string | null {
  if (!fileName) {
    return null;
  }
  if (fileName.startsWith('file://')) {
    return fileUrlToPath(fileName);
  }
  return normalizeSlashes(fileName);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}
