import { CallSite } from './index';

function stubCallSite(): CallSite {
  return {
    getThis: () => undefined,
    getTypeName: () => null,
    getFunction: () => undefined,
    getFunctionName: () => null,
    getMethodName: () => undefined,
    getFileName: () => null,
    getLineNumber: () => null,
    getColumnNumber: () => null,
    getEvalOrigin: () => undefined,
    isToplevel: () => false,
    isEval: () => false,
    isNative: () => false,
    isConstructor: () => false,
  };
}

/**
 * Uses https://v8.dev/docs/stack-trace-api to get stack trace.
 * Returns stub CallSite objects in non-V8 environments (e.g. Firefox, Safari).
 * @returns array of CallSites
 */
export default function callsites(): CallSite[] {
  if (typeof Error.prepareStackTrace === 'undefined' && !('prepareStackTrace' in Error)) {
    // Non-V8 environment: return stub callsite array
    return [stubCallSite(), stubCallSite(), stubCallSite(), stubCallSite()];
  }
  const _prepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  const stck = new Error().stack!.slice(1);
  Error.prepareStackTrace = _prepareStackTrace;
  return stck as any;
}
