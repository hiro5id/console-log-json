type RedactPathToken = string | number | typeof WILDCARD_TOKEN;

const WILDCARD_TOKEN = Symbol('console-log-json.redact-wildcard');
const DEFAULT_CENSOR = 'Redacted';

export type RedactOptions =
  | string[]
  | {
      paths: string[];
      censor?: any;
    };

export interface Redactor {
  redact(value: any): void;
}

export function compileRedactor(config?: RedactOptions | null): Redactor | null {
  if (config == null) {
    return null;
  }

  const normalized = normalizeConfig(config);
  if (normalized == null || normalized.paths.length === 0) {
    return null;
  }

  const compiledPaths: RedactPathToken[][] = [];
  for (const path of normalized.paths) {
    try {
      compiledPaths.push(parsePath(path));
    } catch (_) {
      // Ignore invalid redact paths so logger setup never breaks the app.
    }
  }

  if (compiledPaths.length === 0) {
    return null;
  }

  return {
    redact(value: any) {
      if (value == null || typeof value !== 'object') {
        return;
      }
      for (const tokens of compiledPaths) {
        redactAtPath(value, tokens, 0, normalized.censor);
      }
    },
  };
}

function normalizeConfig(config: RedactOptions): {
  paths: string[];
  censor: any;
} | null {
  if (Array.isArray(config)) {
    return {
      paths: config.filter((path) => typeof path === 'string' && path.trim().length > 0),
      censor: DEFAULT_CENSOR,
    };
  }

  if (!config || !Array.isArray(config.paths)) {
    return null;
  }

  return {
    paths: config.paths.filter((path) => typeof path === 'string' && path.trim().length > 0),
    censor: config.censor !== undefined ? config.censor : DEFAULT_CENSOR,
  };
}

function parsePath(path: string): RedactPathToken[] {
  const tokens: RedactPathToken[] = [];
  let index = 0;

  while (index < path.length) {
    const char = path.charAt(index);

    if (char === '.') {
      index += 1;
      continue;
    }

    if (char === '[') {
      index = parseBracketToken(path, index, tokens);
      continue;
    }

    const start = index;
    while (index < path.length && path.charAt(index) !== '.' && path.charAt(index) !== '[') {
      index += 1;
    }

    const segment = path.substring(start, index).trim();
    if (segment.length === 0) {
      throw new Error(`Invalid redact path: ${path}`);
    }

    tokens.push(segment === '*' ? WILDCARD_TOKEN : segment);
  }

  if (tokens.length === 0) {
    throw new Error(`Invalid redact path: ${path}`);
  }

  return tokens;
}

function parseBracketToken(path: string, startIndex: number, tokens: RedactPathToken[]): number {
  let index = startIndex + 1;
  if (index >= path.length) {
    throw new Error(`Invalid redact path: ${path}`);
  }

  const nextChar = path.charAt(index);
  if (nextChar === '"' || nextChar === "'") {
    const quote = nextChar;
    index += 1;
    let quotedSegment = '';

    while (index < path.length) {
      const current = path.charAt(index);
      if (current === '\\') {
        index += 1;
        if (index < path.length) {
          quotedSegment += path.charAt(index);
          index += 1;
        }
        continue;
      }
      if (current === quote) {
        break;
      }
      quotedSegment += current;
      index += 1;
    }

    if (index >= path.length || path.charAt(index) !== quote) {
      throw new Error(`Invalid redact path: ${path}`);
    }
    index += 1;

    if (path.charAt(index) !== ']') {
      throw new Error(`Invalid redact path: ${path}`);
    }

    tokens.push(quotedSegment);
    return index + 1;
  }

  const endIndex = path.indexOf(']', index);
  if (endIndex < 0) {
    throw new Error(`Invalid redact path: ${path}`);
  }

  const segment = path.substring(index, endIndex).trim();
  if (segment.length === 0) {
    throw new Error(`Invalid redact path: ${path}`);
  }

  if (segment === '*') {
    tokens.push(WILDCARD_TOKEN);
  } else if (/^\d+$/.test(segment)) {
    tokens.push(Number(segment));
  } else {
    tokens.push(segment);
  }

  return endIndex + 1;
}

function redactAtPath(target: any, tokens: RedactPathToken[], tokenIndex: number, censor: any): void {
  if (target == null || typeof target !== 'object') {
    return;
  }

  const token = tokens[tokenIndex];
  const isLeaf = tokenIndex === tokens.length - 1;

  if (token === WILDCARD_TOKEN) {
    redactWildcard(target, tokens, tokenIndex, isLeaf, censor);
    return;
  }

  if (typeof token === 'number') {
    if (!Array.isArray(target) || token < 0 || token >= target.length) {
      return;
    }
    if (isLeaf) {
      target[token] = censor;
      return;
    }
    redactAtPath(target[token], tokens, tokenIndex + 1, censor);
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(target, token)) {
    return;
  }

  if (isLeaf) {
    target[token] = censor;
    return;
  }

  redactAtPath(target[token], tokens, tokenIndex + 1, censor);
}

function redactWildcard(target: any, tokens: RedactPathToken[], tokenIndex: number, isLeaf: boolean, censor: any): void {
  if (Array.isArray(target)) {
    for (let index = 0; index < target.length; index++) {
      if (isLeaf) {
        target[index] = censor;
      } else {
        redactAtPath(target[index], tokens, tokenIndex + 1, censor);
      }
    }
    return;
  }

  const keys = Object.keys(target);
  for (const key of keys) {
    if (isLeaf) {
      target[key] = censor;
    } else {
      redactAtPath(target[key], tokens, tokenIndex + 1, censor);
    }
  }
}
