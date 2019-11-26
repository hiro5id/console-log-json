import { CaptureNestedStackTrace } from './capture-nested-stack-trace';

export class ErrorWithContext extends Error {
  constructor(error: Error | string, extraContext: { [_: string]: any } = {}) {
    if (typeof (extraContext as any) === 'string') {
      if (typeof error === 'object') {
        error.message += ` - ${extraContext}`;
      } else {
        if (error == null) {
          error = (extraContext as any) as string;
        } else {
          error += ` - ${extraContext}`;
        }
      }
      extraContext = {};
    }
    super(typeof error === 'string' ? (error as string) : (error as Error).message);

    // this.message = `${this.message} ${JSON.stringify(extraContext)}`;
    (this as any).extraContext = extraContext;

    if (typeof error !== 'string') {
      const nestedStackTrace = new CaptureNestedStackTrace();
      nestedStackTrace.capture(this, error);
      if ((error as any).extraContext) {
        (this as any).extraContext = Object.assign((error as any).extraContext, extraContext);
      }
    }
  }
}
