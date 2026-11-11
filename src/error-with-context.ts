import { CaptureNestedStackTrace } from './capture-nested-stack-trace';
import { safeObjectAssign } from './safe-object-assign';

// Set only for the duration of wrapErrorKeepingStack()'s constructor call.
let keepOriginalStackForNextConstruction = false;

export class ErrorWithContext extends Error {
  constructor(error: Error | string, extraContext: { [_: string]: any } = {}) {
    const keepOriginalStack = keepOriginalStackForNextConstruction;
    keepOriginalStackForNextConstruction = false;
    let message = typeof error === 'string' ? error : error != null ? error.message : (error as any);
    if (typeof (extraContext as any) === 'string') {
      // Build the combined message without mutating the caller's error object.
      message = message == null ? (extraContext as any as string) : `${message} - ${extraContext}`;
      if (error == null) {
        error = message;
      }
      extraContext = {};
    }
    super(message);

    (this as any).extraContext = extraContext;

    if (typeof error !== 'string') {
      if (keepOriginalStack) {
        Object.defineProperty(this, 'stack', { value: (error as Error).stack, writable: true, configurable: true });
      } else {
        const nestedStackTrace = new CaptureNestedStackTrace();
        nestedStackTrace.capture(this, error);
      }
      // A string extraContext was already folded into the message above, so it is an object here.
      if ((error as any).extraContext != null) {
        if (typeof (error as any).extraContext === 'string') {
          (this as any).extraContext = safeObjectAssign({ message: (error as any).extraContext }, [], extraContext);
        } else {
          (this as any).extraContext = safeObjectAssign((error as any).extraContext, [], extraContext);
        }
      }
    }
  }
}

/**
 * Attach context to an error without adding a stack frame of its own.
 *
 * `new ErrorWithContext(error, ...)` records where it was created and appends the original
 * stack as "Caused By:". That is right when user code wraps an error, but when the logger
 * wraps one internally the new stack would only point at logger internals, followed by a
 * duplicate of the real stack. This keeps just the original stack.
 */
export function wrapErrorKeepingStack(error: Error, extraContext: { [_: string]: any }): ErrorWithContext {
  keepOriginalStackForNextConstruction = true;
  try {
    return new ErrorWithContext(error, extraContext);
  } finally {
    keepOriginalStackForNextConstruction = false;
  }
}
