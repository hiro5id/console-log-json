// Test helpers: capture what the logger writes to process.stdout.

export function overrideStdOut() {
  const output: string[] = [];
  if (typeof process !== 'undefined' && process.stdout) {
    const originalWrite = process.stdout.write;
    (process.stdout.write as any) = (...text: string[]): void => {
      output.push(text[0]);
    };
    return { originalWrite, outputText: output };
  }

  return { originalWrite: null, outputText: output };
}

export function restoreStdOut(originalWrite: any) {
  if (originalWrite != null && typeof process !== 'undefined' && process.stdout) {
    (process.stdout.write as any) = originalWrite;
  }
}
