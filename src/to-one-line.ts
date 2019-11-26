export function ToOneLine(input: string): string {
  if (input != null && input.length > 0) {
    return input.replace(/\r?\n|\r/g, '');
  } else {
    return input;
  }
}
