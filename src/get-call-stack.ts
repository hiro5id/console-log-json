import { FormatStackTrace } from './format-stack-trace';
import { NewLineCharacter } from './new-line-character';

const INTERNAL_STACK_PATTERNS = [
  /captureFileInfo/,
  /emitConsoleJsonLog/,
  /logUsingConsoleJson/,
  /LoggerAdaptToConsole\.console\./,
  /getCallingFilename/,
  /getCallStack/,
];
const INTERNAL_STACK_PATH_HINTS = ['/node_modules/console-log-json/', '/console-log-json/dist/', '/console-log-json/src/'];

/**
 * Get call stack by creating a new Error. Use getCallStackFromString() to reuse an existing stack.
 */
export function getCallStack(): string {
  return getCallStackFromString(new Error().stack ?? '');
}

/**
 * Get call stack from an existing stack string, avoiding extra Error object creation.
 */
export function getCallStackFromString(stack: string): string {
  const callStack = FormatStackTrace.toArray(stack);
  // remove the "error" line for call stack since this is not used for error reporting
  if (callStack && callStack.length >= 1 && /^Error(?::|$)/.test(callStack[0].trim())) {
    callStack.splice(0, 1);
  }

  while (callStack.length > 0 && isInternalStackFrame(callStack[0])) {
    callStack.splice(0, 1);
  }

  return callStack.join(`${NewLineCharacter()}${FormatStackTrace.divider}`);
}

function isInternalStackFrame(frameLine: string): boolean {
  for (const pattern of INTERNAL_STACK_PATTERNS) {
    if (pattern.test(frameLine)) {
      return true;
    }
  }

  for (const hint of INTERNAL_STACK_PATH_HINTS) {
    if (frameLine.includes(hint)) {
      return true;
    }
  }

  return false;
}
