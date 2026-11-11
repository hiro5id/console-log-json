/* tslint:disable:object-literal-sort-keys */
import { LOG_LEVEL } from './types';

/**
 * Console methods beyond log/info/warn/error/... that produce output. Each one is patched explicitly so
 * it emits structured JSON in both Node.js and browsers. Without this, Node.js routes some of them
 * through console.log/console.error internally (trace ends up as an `error` log with the stack inside
 * `message`, table as an ASCII-box string), console.dir bypasses the logger, and browsers print them natively.
 *
 * Function names start with `consoleJson` so stack filtering can recognize them in bundles
 * (see INTERNAL_STACK_PATTERNS in get-call-stack.ts).
 */

export type ExtendedConsoleMethodName =
  | 'trace'
  | 'table'
  | 'dir'
  | 'dirxml'
  | 'assert'
  | 'count'
  | 'countReset'
  | 'time'
  | 'timeLog'
  | 'timeEnd'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd';

export const EXTENDED_CONSOLE_METHOD_NAMES: ExtendedConsoleMethodName[] = [
  'trace',
  'table',
  'dir',
  'dirxml',
  'assert',
  'count',
  'countReset',
  'time',
  'timeLog',
  'timeEnd',
  'group',
  'groupCollapsed',
  'groupEnd',
];

export const TABLE_MESSAGE = '<console-table>';

export type ConsoleJsonLogFunction = (args: any[], level: LOG_LEVEL, options?: { forceCallStack?: boolean; metadata?: { [key: string]: any } }) => void;

/** Counters and timers live here, not in the native console, so count/time work the same everywhere. */
export function createExtendedConsoleMethods(log: ConsoleJsonLogFunction): Record<ExtendedConsoleMethodName, (...args: any[]) => void> {
  const counts = new Map<string, number>();
  const timers = new Map<string, number>();

  // Node.js's console.trace prints "Trace" when called without arguments.
  function consoleJsonTrace(...args: any[]): void {
    log(args.length > 0 ? args : ['Trace'], LOG_LEVEL.info, { forceCallStack: true });
  }

  function consoleJsonTable(data?: any, columns?: any): void {
    if (data == null || typeof data !== 'object') {
      log([data], LOG_LEVEL.info);
      return;
    }
    log([TABLE_MESSAGE], LOG_LEVEL.info, { metadata: { '@table': projectTableColumns(data, columns) } });
  }

  // util.inspect options (depth, colors, ...) don't apply to JSON output.
  function consoleJsonDir(value?: any): void {
    log([value], LOG_LEVEL.info);
  }

  function consoleJsonDirxml(...args: any[]): void {
    log(args, LOG_LEVEL.info);
  }

  function consoleJsonAssert(condition?: any, ...args: any[]): void {
    if (condition) {
      return;
    }
    log(['Assertion failed', ...args], LOG_LEVEL.error);
  }

  function consoleJsonCount(label?: any): void {
    const key = normalizeLabel(label);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    log([`${key}: ${count}`], LOG_LEVEL.info, { metadata: { '@label': key, '@count': count } });
  }

  function consoleJsonCountReset(label?: any): void {
    const key = normalizeLabel(label);
    if (!counts.has(key)) {
      log([`Count for '${key}' does not exist`], LOG_LEVEL.warn, { metadata: { '@label': key } });
      return;
    }
    counts.delete(key);
  }

  function consoleJsonTime(label?: any): void {
    const key = normalizeLabel(label);
    if (timers.has(key)) {
      log([`Label '${key}' already exists for console.time()`], LOG_LEVEL.warn, { metadata: { '@label': key } });
      return;
    }
    timers.set(key, now());
  }

  function consoleJsonTimeLog(label?: any, ...data: any[]): void {
    consoleJsonLogDuration('timeLog', label, data, false);
  }

  function consoleJsonTimeEnd(label?: any): void {
    consoleJsonLogDuration('timeEnd', label, [], true);
  }

  // Node.js's console.group() prints its arguments, and nothing when there are none.
  function consoleJsonGroup(...args: any[]): void {
    if (args.length > 0) {
      log(args, LOG_LEVEL.info);
    }
  }

  // Nesting isn't tracked (JSON output isn't indented), so there is nothing to end.
  function consoleJsonGroupEnd(): void {
    /* no-op */
  }

  function consoleJsonLogDuration(methodName: string, label: any, data: any[], end: boolean): void {
    const key = normalizeLabel(label);
    const start = timers.get(key);
    if (start === undefined) {
      log([`No such label '${key}' for console.${methodName}()`], LOG_LEVEL.warn, { metadata: { '@label': key } });
      return;
    }
    if (end) {
      timers.delete(key);
    }
    const durationMs = Math.round((now() - start) * 1000) / 1000;
    log([`${key}: ${durationMs}ms`, ...data], LOG_LEVEL.info, { metadata: { '@label': key, '@durationMs': durationMs } });
  }

  return {
    trace: consoleJsonTrace,
    table: consoleJsonTable,
    dir: consoleJsonDir,
    dirxml: consoleJsonDirxml,
    assert: consoleJsonAssert,
    count: consoleJsonCount,
    countReset: consoleJsonCountReset,
    time: consoleJsonTime,
    timeLog: consoleJsonTimeLog,
    timeEnd: consoleJsonTimeEnd,
    group: consoleJsonGroup,
    groupCollapsed: consoleJsonGroup,
    groupEnd: consoleJsonGroupEnd,
  };
}

function normalizeLabel(label: any): string {
  return label === undefined ? 'default' : String(label);
}

function now(): number {
  try {
    if (typeof performance !== 'undefined' && performance != null && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch (_) {
    /* performance not available */
  }
  return Date.now();
}

/** Like console.table(data, columns): keep only the listed properties of each row. */
function projectTableColumns(data: any, columns: any): any {
  if (!Array.isArray(columns) || columns.length === 0) {
    return data;
  }

  const keys = columns.map((column: any) => String(column));
  const pickColumns = (row: any) => {
    if (row == null || typeof row !== 'object') {
      return row;
    }
    const picked: { [key: string]: any } = {};
    for (const key of keys) {
      if (key in row) {
        picked[key] = row[key];
      }
    }
    return picked;
  };

  if (Array.isArray(data)) {
    return data.map(pickColumns);
  }

  const projected: { [key: string]: any } = {};
  for (const rowKey of Object.keys(data)) {
    projected[rowKey] = pickColumns(data[rowKey]);
  }
  return projected;
}
