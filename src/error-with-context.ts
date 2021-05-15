import { CaptureNestedStackTrace } from './capture-nested-stack-trace';
import { safeObjectAssign } from './safe-object-assign';

export class ErrorWithContext extends Error {
  constructor(error: Error | string, extraContext: { [_: string]: any } = {}) {
    if (typeof (extraContext as any) === 'string') {
      if (typeof error === 'object') {
        error.message += ` - ${extraContext}`;
      } else {
        if (error == null) {
          error = extraContext as any as string;
        } else {
          error += ` - ${extraContext}`;
        }
      }
      extraContext = {};
    }
    super(typeof error === 'string' ? (error as string) : (error as Error).message);

    (this as any).extraContext = extraContext;

    if (typeof error !== 'string') {
      const nestedStackTrace = new CaptureNestedStackTrace();
      nestedStackTrace.capture(this, error);
      if ((error as any).extraContext != null) {
        if (typeof (error as any).extraContext === 'string') {
          // noinspection SuspiciousTypeOfGuard
          if (typeof extraContext === 'string') {
            (this as any).extraContext = safeObjectAssign({ message: (error as any).extraContext }, [], { message2: extraContext });
          } else {
            (this as any).extraContext = safeObjectAssign({ message: (error as any).extraContext }, [], extraContext);
          }
        } else {
          // noinspection SuspiciousTypeOfGuard
          if (typeof extraContext === 'string') {
            (this as any).extraContext = safeObjectAssign((error as any).extraContext, [], { message: extraContext });
          } else {
            (this as any).extraContext = safeObjectAssign((error as any).extraContext, [], extraContext);
          }
        }
      }
    }
  }
}
