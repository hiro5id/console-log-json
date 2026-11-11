import { FormatStackTrace } from './format-stack-trace';
import { isInternalFilePath } from './internal-frames';
import { NewLineCharacter } from './new-line-character';

// Function-name fallback for bundles where file paths can't identify library frames.
const INTERNAL_STACK_PATTERNS = [
  /captureFileInfo/,
  /appendFileMetadata/,
  /emitConsoleJsonLog/,
  /logUsingConsoleJson/,
  /LoggerAdaptToConsole\.console\./,
  /getCallingFilename/,
  /getCallStack/,
];

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
  // Find internal frames before stripping the project's parent dir: the check compares
  // frames against this library's absolute install directory.
  const callStack = FormatStackTrace.toUnstrippedArray(stack);
  // remove the "error" line for call stack since this is not used for error reporting
  if (callStack && callStack.length >= 1 && /^Error(?::|$)/.test(callStack[0].trim())) {
    callStack.splice(0, 1);
  }

  while (callStack.length > 0 && isInternalStackFrame(callStack[0])) {
    callStack.splice(0, 1);
  }

  const lines = FormatStackTrace.stripAppParentDir(callStack);
  // Splitting on "    at" leaves the first remaining frame as " fn (file:1:1)": give it the
  // same "at fn (...)" form as every other frame. Stacks without "    at" frames (Firefox,
  // Safari: "fn@url:1:1") have no leading space and are left alone.
  if (lines.length > 0 && /^ \S/.test(lines[0])) {
    lines[0] = `at${lines[0]}`;
  }
  return lines.join(`${NewLineCharacter()}${FormatStackTrace.divider}`);
}

function isInternalStackFrame(frameLine: string): boolean {
  for (const pattern of INTERNAL_STACK_PATTERNS) {
    if (pattern.test(frameLine)) {
      return true;
    }
  }

  return isInternalFilePath(frameLine);
}
