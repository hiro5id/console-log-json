import { CallSite } from './callsites';
import { getAppRootParentDir } from './get-app-root';
import callsites from './callsites/get-callsites';
import { getCallStack } from './get-call-stack';
import { fileUrlToPath, isInternalFilePath, normalizeSlashes } from './internal-frames';

type AnyFunction = (...args: any[]) => any;

// Used to skip internal frames. File paths (internal-frames.ts) survive minification in
// Node/ESM builds, while function identity helps when library helpers are bundled into one file.
const internalCallerFunctions = new Set<AnyFunction>();

// Fallback patterns for when __filename is not available (browser/ESM).
// These match function names and will work in unminified code.
const FALLBACK_PATTERNS = [/logUsingConsoleJson/, /LoggerAdaptToConsole\.console\./, /getCallingFilename/, /getCallStack/, /consoleJson[A-Z]\w*/];

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

function stripAppRoot(name: string): string {
  return stripParentDir(name, getAppRootParentDir());
}

/**
 * Exported for tests. Removes `parentDir` (the directory containing the project root)
 * from the start of a slash-normalized file name, then any leading slash.
 */
export function stripParentDir(name: string, rawParentDir: string): string {
  const parentDir = normalizeSlashes(rawParentDir);
  const parentPrefix = parentDir.endsWith('/') ? parentDir : `${parentDir}/`;
  let stripped = name;
  if (parentDir.length > 0 && stripped.startsWith(parentPrefix)) {
    stripped = stripped.substring(parentPrefix.length - 1);
  }
  if (stripped.startsWith('/')) {
    stripped = stripped.substring(1);
  }
  return stripped;
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
