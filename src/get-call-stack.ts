import { FormatStackTrace } from './format-stack-trace';
import { NewLineCharacter } from './new-line-character';

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
  if (callStack && callStack.length >= 1 && callStack[0].startsWith('Error:')) {
    callStack.splice(0, 1);
  }
  return callStack.join(`${NewLineCharacter()}${FormatStackTrace.divider}`);
}
