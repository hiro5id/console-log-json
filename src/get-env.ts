/**
 * Safely reads an environment variable. Returns undefined in browser or
 * any environment where process.env is not available.
 *
 * Bundler `define` (webpack DefinePlugin, Vite/esbuild `define`) only replaces static
 * `process.env.NAME` expressions, never `process.env[key]`. So when the dynamic lookup finds
 * nothing, the logger's own variables are read again through readStaticEnv(), where each one is
 * written out statically and a build-time replacement can take effect.
 */
export function getEnv(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const value = process.env[key];
      if (value !== undefined) {
        return value;
      }
    }
  } catch (_) {
    /* browser or restricted environment */
  }

  try {
    return readStaticEnv(key);
  } catch (_) {
    // No define replacement and no `process` (browser): ReferenceError.
    return undefined;
  }
}

/* tslint:disable:cyclomatic-complexity */
function readStaticEnv(key: string): string | undefined {
  switch (key) {
    case 'CONSOLE_LOG_COLORIZE':
      return process.env.CONSOLE_LOG_COLORIZE;
    case 'CONSOLE_LOG_COLORIZE_BACKGROUND':
      return process.env.CONSOLE_LOG_COLORIZE_BACKGROUND;
    case 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS':
      return process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS;
    case 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK':
      return process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS_EXCEPT_STACK;
    case 'CONSOLE_LOG_JSON_NO_TIME_STAMP':
      return process.env.CONSOLE_LOG_JSON_NO_TIME_STAMP;
    case 'CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE':
      return process.env.CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE;
    case 'CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR':
      return process.env.CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR;
    case 'CONSOLE_LOG_JSON_NO_FILE_NAME':
      return process.env.CONSOLE_LOG_JSON_NO_FILE_NAME;
    case 'CONSOLE_LOG_JSON_NO_PACKAGE_NAME':
      return process.env.CONSOLE_LOG_JSON_NO_PACKAGE_NAME;
    case 'CONSOLE_LOG_JSON_NO_LOGGER_DEBUG':
      return process.env.CONSOLE_LOG_JSON_NO_LOGGER_DEBUG;
    case 'CONSOLE_LOG_JSON_CONTEXT_KEY':
      return process.env.CONSOLE_LOG_JSON_CONTEXT_KEY;
    case 'CONSOLE_LOG_JSON_LOG_LEVEL':
      return process.env.CONSOLE_LOG_JSON_LOG_LEVEL;
    case 'CONSOLE_LOG_JSON_DEBUG_STRING':
      return process.env.CONSOLE_LOG_JSON_DEBUG_STRING;
    case 'CONSOLE_LOG_JSON_CUSTOM_OPTIONS':
      return process.env.CONSOLE_LOG_JSON_CUSTOM_OPTIONS;
    case 'CONSOLE_LOG_JSON_ON_LOG':
      return process.env.CONSOLE_LOG_JSON_ON_LOG;
    case 'CONSOLE_LOG_JSON_ON_LOG_TIMEOUT':
      return process.env.CONSOLE_LOG_JSON_ON_LOG_TIMEOUT;
    case 'CONSOLE_LOG_JSON_TRANSFORM_OUTPUT':
      return process.env.CONSOLE_LOG_JSON_TRANSFORM_OUTPUT;
    case 'CONSOLE_LOG_JSON_REDACT':
      return process.env.CONSOLE_LOG_JSON_REDACT;
    default:
      return undefined;
  }
}
/* tslint:enable:cyclomatic-complexity */
