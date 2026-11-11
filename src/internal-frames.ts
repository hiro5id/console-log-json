// Detects stack frames that belong to this library, so @filename and @logCallStack can
// skip them. Shared by get-calling-filename.ts and get-call-stack.ts.

// Path fragments that identify the library wherever it is installed under its own name.
const INTERNAL_PATH_HINTS = ['/node_modules/console-log-json/', '/console-log-json/dist/', '/console-log-json/src/'];

// The directory this module was loaded from, with a trailing slash. Catches installs where
// the hints don't apply (vendored copies, renamed folders). In the CommonJS build it comes
// from __filename; in the ESM build from import.meta.url, exposed by the bundle banner.
const internalModuleDirs = detectInternalModuleDirs();

/** True when a file path or stack frame line points into this library's own files. */
export function isInternalFilePath(text: string): boolean {
  const normalizedText = normalizeSlashes(text);
  const decodedText = safeDecodeUri(normalizedText);
  for (const dir of internalModuleDirs) {
    if (normalizedText.includes(dir) || decodedText.includes(dir)) {
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

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

export function fileUrlToPath(fileUrl: string): string | null {
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

function detectInternalModuleDirs(): string[] {
  const dirs = new Set<string>();

  try {
    if (typeof __filename !== 'undefined') {
      const dir = getDirectoryName(__filename);
      if (dir) {
        dirs.add(`${dir}/`);
      }
    }
  } catch (_) {
    /* __filename not available */
  }

  const importMetaPath = tryGetImportMetaPath();
  if (importMetaPath) {
    const dir = getDirectoryName(importMetaPath);
    if (dir) {
      dirs.add(`${dir}/`);
    }
  }

  return Array.from(dirs);
}

// Defined by the banner of the ESM build (scripts/build-esm.js) as import.meta.url.
// Undeclared in the CommonJS build and in consumers' own bundles of the source.
declare const __console_log_json_module_url__: string | undefined;

function tryGetImportMetaPath(): string | null {
  try {
    const importMetaUrl = typeof __console_log_json_module_url__ !== 'undefined' ? __console_log_json_module_url__ : undefined;
    if (!importMetaUrl || typeof importMetaUrl !== 'string' || !importMetaUrl.startsWith('file://')) {
      return null;
    }
    return fileUrlToPath(importMetaUrl);
  } catch (_) {
    return null;
  }
}

function getDirectoryName(filePath: string): string | null {
  const normalized = normalizeSlashes(filePath);
  const lastSep = normalized.lastIndexOf('/');
  if (lastSep <= 0) {
    return null;
  }
  return normalized.substring(0, lastSep);
}

function safeDecodeUri(text: string): string {
  try {
    return decodeURI(text);
  } catch (_) {
    return text;
  }
}
