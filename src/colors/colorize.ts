import { getEnv } from '../get-env';
import { jsonStringifySafe } from '../json-stringify-safe/stringify-safe';

export interface IDefaultColorMap {
  black: string;
  red: string;
  darkRed: string;
  lightRed: string;
  green: string;
  darkGreen: string;
  lightGreen: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  teal: string;
  lightTeal: string;
  darkBlue: string;
  darkYellow: string;
  lightBlue: string;
  purple: string;
  pink: string;
  lightPink: string;
}

export const defaultColorMap: IDefaultColorMap = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  darkRed: '\x1b[38;2;179;5;15m',
  lightRed: '\x1b[38;2;255;137;149m',
  green: '\x1b[32m',
  darkGreen: '\x1b[38;2;36;119;36m',
  lightGreen: '\x1b[38;2;0;255;127m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  teal: '\x1b[38;2;26;175;192m',
  lightTeal: '\x1b[38;2;31;230;255m',
  darkBlue: '\x1b[38;2;54;124;192m',
  darkYellow: '\x1b[38;2;159;147;45m',
  lightBlue: '\x1b[38;2;120;193;255m',
  purple: '\x1b[38;2;135;38;162m',
  pink: '\x1b[38;2;168;53;143m',
  lightPink: '\x1b[38;2;255;81;216m',
};

export type ColorValue = keyof IDefaultColorMap;

export interface IColorConfiguration {
  separator: ColorValue;
  string: ColorValue;
  number: ColorValue;
  boolean: ColorValue;
  null: ColorValue;
  errorLevel: ColorValue;
  nonErrorLevel: ColorValue;
  nonErrorMessage: ColorValue;
  errorMessage: ColorValue;
  warnLevel: ColorValue;
  fileName: ColorValue;
  logCallStack: ColorValue;
  packageName: ColorValue;
  timestamp: ColorValue;
  errCallStack: ColorValue;
}

export type ColorItemName = keyof IColorConfiguration;

export const defaultColors: IColorConfiguration = {
  separator: 'black',
  string: 'white',
  number: 'magenta',
  boolean: 'cyan',
  null: 'red',
  errorLevel: 'red',
  nonErrorLevel: 'lightTeal',
  nonErrorMessage: 'lightGreen',
  errorMessage: 'red',
  warnLevel: 'yellow',
  fileName: 'yellow',
  logCallStack: 'black',
  packageName: 'yellow',
  timestamp: 'lightPink',
  errCallStack: 'lightRed',
};

export type BackgroundTheme = 'dark' | 'light' | 'unknown';

// TODO: this is super beta, consider using Sindre's supports-colors
export function supportsColor() {
  const onHeroku = truth(getEnv('DYNO')) ? true : false;
  const forceNoColor = truth(getEnv('FORCE_NO_COLOR')) ? true : false;
  const forceColor = truth(getEnv('FORCE_COLOR')) ? true : false;
  return (!onHeroku && !forceNoColor) || forceColor;
}

function truth(it: any) {
  return it && it !== 'false' ? true : false;
}

let cachedBackgroundTheme: BackgroundTheme | null = null;

export function resetBackgroundThemeCache(): void {
  cachedBackgroundTheme = null;
}

function detectBackgroundTheme(): BackgroundTheme {
  const override = getEnv('CONSOLE_LOG_COLORIZE_BACKGROUND');
  if (override === 'dark' || override === 'd') return 'dark';
  if (override === 'light' || override === 'l') return 'light';

  const colorFgBg = getEnv('COLORFGBG');
  if (colorFgBg != null) {
    const parts = colorFgBg.split(';');
    const bgIndex = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bgIndex)) {
      return bgIndex <= 6 ? 'dark' : 'light';
    }
  }

  const termProgram = getEnv('TERM_PROGRAM');
  if (termProgram === 'Apple_Terminal') return 'light';
  if (termProgram === 'vscode') return 'dark';

  if (truth(getEnv('WT_SESSION'))) return 'dark';
  if (truth(getEnv('VTE_VERSION'))) return 'dark';

  return 'unknown';
}

function getBackgroundTheme(): BackgroundTheme {
  if (cachedBackgroundTheme === null) {
    cachedBackgroundTheme = detectBackgroundTheme();
  }
  return cachedBackgroundTheme;
}

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToAnsi(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

const keyColorCache = new Map<string, string>();

function generateKeyAnsiCode(bareKeyName: string, theme: BackgroundTheme): string {
  const cacheKey = `${theme}:${bareKeyName}`;
  const cached = keyColorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const hash = djb2Hash(bareKeyName);
  const hue = hash % 360;
  const isDark = theme !== 'light';
  const s = isDark ? 0.85 : 0.8;
  const l = isDark ? 0.72 : 0.32;
  const [r, g, b] = hslToRgb(hue, s, l);
  const ansi = rgbToAnsi(r, g, b);

  keyColorCache.set(cacheKey, ansi);
  return ansi;
}

interface IScannedJsonStringToken {
  endIndex: number;
  normalizedStringText: string;
  tokenText: string;
  isKey: boolean;
}

function getJsonString(jsonInput: any, spacing?: number): string {
  if (typeof jsonInput !== 'string') {
    return jsonStringifySafe(jsonInput, undefined, spacing);
  }
  return jsonStringifySafe(JSON.parse(jsonInput), undefined, spacing);
}

function isWhitespaceCharacter(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function isDigitCharacter(character: string): boolean {
  return character >= '0' && character <= '9';
}

function scanJsonStringToken(json: string, startIndex: number): IScannedJsonStringToken {
  let stringEndIndex = startIndex + 1;

  while (stringEndIndex < json.length) {
    const character = json.charAt(stringEndIndex);

    if (character === '\\') {
      stringEndIndex += 1;
      if (stringEndIndex < json.length) {
        stringEndIndex += 1;
      }
      continue;
    }

    if (character === '"') {
      stringEndIndex += 1;
      break;
    }

    stringEndIndex += 1;
  }

  if (stringEndIndex > json.length) {
    stringEndIndex = json.length;
  }

  const stringText = json.slice(startIndex, stringEndIndex);
  let tokenEndIndex = stringEndIndex;

  while (tokenEndIndex < json.length && isWhitespaceCharacter(json.charAt(tokenEndIndex))) {
    tokenEndIndex += 1;
  }

  const isKey = json.charAt(tokenEndIndex) === ':';
  if (isKey) {
    tokenEndIndex += 1;
  }

  return {
    endIndex: tokenEndIndex,
    normalizedStringText: stringText.toLowerCase(),
    tokenText: json.slice(startIndex, tokenEndIndex),
    isKey,
  };
}

function scanJsonNumberEndIndex(json: string, startIndex: number): number {
  let index = startIndex;

  if (json.charAt(index) === '-') {
    index += 1;
  }

  if (json.charAt(index) === '0') {
    index += 1;
  } else {
    while (index < json.length && isDigitCharacter(json.charAt(index))) {
      index += 1;
    }
  }

  if (json.charAt(index) === '.') {
    index += 1;
    while (index < json.length && isDigitCharacter(json.charAt(index))) {
      index += 1;
    }
  }

  if (json.charAt(index) === 'e' || json.charAt(index) === 'E') {
    index += 1;
    if (json.charAt(index) === '+' || json.charAt(index) === '-') {
      index += 1;
    }
    while (index < json.length && isDigitCharacter(json.charAt(index))) {
      index += 1;
    }
  }

  return index > startIndex ? index : startIndex + 1;
}

function getStringValueColorCode(
  normalizedStringText: string,
  previousKeyName: string,
  isErrorLevel: boolean,
  isWarnLevel: boolean,
): {
  colorCode: ColorItemName;
  isErrorLevel: boolean;
  isWarnLevel: boolean;
} {
  let colorCode: ColorItemName = 'string';

  switch (previousKeyName) {
    case '"level"':
      if (normalizedStringText === '"error"') {
        colorCode = 'errorLevel';
        isErrorLevel = true;
      } else if (normalizedStringText === '"warn"') {
        colorCode = 'warnLevel';
        isWarnLevel = true;
      } else {
        colorCode = 'nonErrorLevel';
      }
      break;
    case '"message"':
      if (isErrorLevel) {
        colorCode = 'errorMessage';
      } else if (isWarnLevel) {
        colorCode = 'warnLevel';
      } else {
        colorCode = 'nonErrorMessage';
      }
      break;
    case '"@filename"':
      colorCode = 'fileName';
      break;
    case '"@logcallstack"':
      colorCode = 'logCallStack';
      break;
    case '"@packagename"':
      colorCode = 'packageName';
      break;
    case '"@timestamp"':
      colorCode = 'timestamp';
      break;
    case '"errcallstack"':
      colorCode = 'errCallStack';
      break;
  }

  return { colorCode, isErrorLevel, isWarnLevel };
}

function colorizeJsonString(json: string, colors: IColorConfiguration, colorMap: IDefaultColorMap): string {
  const theme = getBackgroundTheme();
  const separatorColor = (colorMap as any)[colors.separator];
  let previousKeyName = '';
  let previousTokenWasKey = false;
  let isErrorLevel = false;
  let isWarnLevel = false;
  let lastCopiedIndex = 0;
  let output = separatorColor;
  let index = 0;

  while (index < json.length) {
    const character = json.charAt(index);
    let tokenEndIndex = -1;
    let tokenText = '';
    let colorCode: ColorItemName | undefined;

    if (character === '"') {
      const scannedToken = scanJsonStringToken(json, index);
      tokenEndIndex = scannedToken.endIndex;
      tokenText = scannedToken.tokenText;

      if (scannedToken.isKey) {
        const bareKeyName = scannedToken.normalizedStringText.slice(1, -1);
        const keyAnsiCode = generateKeyAnsiCode(bareKeyName, theme);
        output += json.slice(lastCopiedIndex, index);
        output += `\x1b[0m${keyAnsiCode}${tokenText}${separatorColor}`;
        lastCopiedIndex = tokenEndIndex;
        index = tokenEndIndex;
        previousKeyName = scannedToken.normalizedStringText;
        previousTokenWasKey = true;
        continue;
      } else {
        const stringColorResult = getStringValueColorCode(scannedToken.normalizedStringText, previousTokenWasKey ? previousKeyName : '', isErrorLevel, isWarnLevel);
        colorCode = stringColorResult.colorCode;
        isErrorLevel = stringColorResult.isErrorLevel;
        isWarnLevel = stringColorResult.isWarnLevel;
        previousTokenWasKey = false;
      }
    } else if (character === 't' && json.slice(index, index + 4) === 'true') {
      tokenEndIndex = index + 4;
      tokenText = json.slice(index, tokenEndIndex);
      colorCode = 'boolean';
      previousTokenWasKey = false;
    } else if (character === 'f' && json.slice(index, index + 5) === 'false') {
      tokenEndIndex = index + 5;
      tokenText = json.slice(index, tokenEndIndex);
      colorCode = 'boolean';
      previousTokenWasKey = false;
    } else if (character === 'n' && json.slice(index, index + 4) === 'null') {
      tokenEndIndex = index + 4;
      tokenText = json.slice(index, tokenEndIndex);
      colorCode = 'null';
      previousTokenWasKey = false;
    } else if (character === '-' || isDigitCharacter(character)) {
      tokenEndIndex = scanJsonNumberEndIndex(json, index);
      tokenText = json.slice(index, tokenEndIndex);
      colorCode = 'number';
      previousTokenWasKey = false;
    }

    if (colorCode != null && tokenEndIndex > index) {
      const color = (colorMap as any)[(colors as any)[colorCode]] || '';
      output += json.slice(lastCopiedIndex, index);
      output += `\x1b[0m${color}${tokenText}${separatorColor}`;
      lastCopiedIndex = tokenEndIndex;
      index = tokenEndIndex;
      continue;
    }

    index += 1;
  }

  output += json.slice(lastCopiedIndex);
  output += '\x1b[0m';

  return output;
}

/**
 * Given an object, it returns its JSON representation colored using
 * ANSI escape characters.
 * @param {(Object | string)} json - JSON object to highlighter.
 * @param {Colors} [colors] - A map with the ANSI characters for each supported color.
 * @param {ColorMap} [colorMap] - An object to configure the coloring.
 * @param {number} [spacing=2] - The indentation spaces.
 * @returns {string} Stringified JSON colored with ANSI escape characters.
 */
export function colorJson(jsonInput: any, colorsInput: Partial<IColorConfiguration> = defaultColors, colorMap: IDefaultColorMap = defaultColorMap, spacing?: number) {
  const colors = { ...defaultColors, ...colorsInput };
  const json = getJsonString(jsonInput, spacing);

  if (supportsColor()) {
    return colorizeJsonString(json, colors, colorMap);
  }

  return json;
}
