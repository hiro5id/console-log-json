// import callsites from 'callsites';

import { FormatStackTrace } from './format-stack-trace';

export function getCallStack(): string[] {
  const callStack = FormatStackTrace.toArray(new Error().stack ?? '');
  if (callStack && callStack.length >= 1 && callStack[0].startsWith('Error:')) {
    callStack.splice(0, 1);
  }
  return callStack;
  /*
  const callsiteArray: callsites.CallSite[] = callsites();

  return callsiteArray.map(
    m => `${m.getFileName()}:${m.getLineNumber()},${m.getColumnNumber()} ${m.getFunctionName()}`,
  );
*/
}
