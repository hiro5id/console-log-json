// import callsites from 'callsites';

import { FormatStackTrace } from './format-stack-trace';
import { NewLineCharacter } from './new-line-character';

export function getCallStack(): string {
  const callStack = FormatStackTrace.toArray(new Error().stack ?? '');
  // remove the "error" line for call stack since this is not used for error reporting
  if (callStack && callStack.length >= 1 && callStack[0].startsWith('Error:')) {
    callStack.splice(0, 1);
  }
  return callStack.join(`${NewLineCharacter()}${FormatStackTrace.divider}`);

  /*
  const callsiteArray: callsites.CallSite[] = callsites();

  return callsiteArray.map(
    m => `${m.getFileName()}:${m.getLineNumber()},${m.getColumnNumber()} ${m.getFunctionName()}`,
  );
*/
}
