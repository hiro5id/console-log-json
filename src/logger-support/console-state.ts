type ConsoleMethodName = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly' | 'log';

const CONSOLE_METHOD_NAMES: ConsoleMethodName[] = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'log'];
const capturedConsoleMethods: Partial<Record<ConsoleMethodName, any>> = {};

let internalWriteDepth = 0;

export function captureConsoleMethodBackups(): void {
  for (const methodName of CONSOLE_METHOD_NAMES) {
    if (capturedConsoleMethods[methodName] == null) {
      capturedConsoleMethods[methodName] = (console as any)[methodName];
    }
  }
}

export function patchConsoleMethod(methodName: ConsoleMethodName, patchedMethod: (...args: any[]) => void): void {
  (console as any)[methodName] = patchedMethod;
}

export function restoreConsoleMethodBackups(): void {
  for (const methodName of CONSOLE_METHOD_NAMES) {
    if (capturedConsoleMethods[methodName] != null) {
      (console as any)[methodName] = capturedConsoleMethods[methodName];
    }
  }
}

export function writeOutput(text: string): void {
  runWithInternalWriteGuard(() => {
    if (shouldUseProcessStdoutWrite()) {
      process.stdout.write(text + '\n');
      return;
    }

    const consoleLogBackup = capturedConsoleMethods.log;
    if (consoleLogBackup) {
      invokeCapturedConsoleMethod(consoleLogBackup, text);
    }
  });
}

export function nativeConsoleLog(...args: any[]): void {
  const consoleLogBackup = capturedConsoleMethods.log;
  if (consoleLogBackup) {
    runWithInternalWriteGuard(() => {
      invokeCapturedConsoleMethod(consoleLogBackup, ...args);
    });
    return;
  }

  console.log(...args);
}

export function logLastResortProcessingError(functionName: string, err: Error): void {
  try {
    const consoleErrorBackup = capturedConsoleMethods.error;
    if (consoleErrorBackup != null) {
      runWithInternalWriteGuard(() => {
        invokeCapturedConsoleMethod(consoleErrorBackup, `{"level":"error","message":"Error: console-log-json: error while trying to process ${functionName} : ${err.message}"}`);
      });
    }
  } catch (_) {
    // Fail silently. This is already the last-resort logger path.
  }
}

export function isHandlingInternalWriteFeedback(): boolean {
  return internalWriteDepth > 0;
}

function invokeCapturedConsoleMethod(method: any, ...args: any[]): void {
  if (typeof method !== 'function') {
    return;
  }

  try {
    Function.prototype.apply.call(method, console, args);
  } catch (_) {
    method(...args);
  }
}

function runWithInternalWriteGuard(callback: () => void): void {
  internalWriteDepth += 1;
  try {
    callback();
  } finally {
    internalWriteDepth -= 1;
  }
}

function shouldUseProcessStdoutWrite(): boolean {
  if (typeof process === 'undefined' || process.stdout == null || typeof process.stdout.write !== 'function') {
    return false;
  }

  // Browser-oriented hosts sometimes expose a compatibility process.stdout.write
  // that loops back into patched console methods. Keep direct stdout writes for
  // real Node, but prefer the saved native console path when a DOM is present.
  if (hasDomLikeDocument()) {
    return false;
  }

  return true;
}

function hasDomLikeDocument(): boolean {
  const globalObject: any = typeof globalThis !== 'undefined' ? globalThis : {};
  const maybeWindow = globalObject.window;
  const maybeDocument = globalObject.document || (maybeWindow != null ? maybeWindow.document : undefined);
  if (maybeDocument == null) {
    return false;
  }

  try {
    return typeof maybeDocument.createElement === 'function';
  } catch (_) {
    return true;
  }
}
