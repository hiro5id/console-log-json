export function formatStackTrace(stack: string): string {
  const divider = '    at';
  let noNewLines = stack.replace('\n', '');
  noNewLines = noNewLines.replace('\r', '');
  const lines = noNewLines.split(divider);
  return lines.join(`\n${divider}`);
}
