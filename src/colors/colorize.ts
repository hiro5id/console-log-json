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
  key: ColorValue;
  levelKey: ColorValue;
  messageKey: ColorValue;
  errorLevel: ColorValue;
  nonErrorLevel: ColorValue;
  nonErrorMessage: ColorValue;
  errorMessage: ColorValue;
  warnLevel: ColorValue;
  fileNameKey: ColorValue;
  fileName: ColorValue;
  logCallStackKey: ColorValue;
  logCallStack: ColorValue;
  packageNameKey: ColorValue;
  packageName: ColorValue;
  timestampKey: ColorValue;
  timestamp: ColorValue;
  errCallStackKey: ColorValue;
  errCallStack: ColorValue;
}

export type ColorItemName = keyof IColorConfiguration;

export const defaultColors: IColorConfiguration = {
  separator: 'black',
  string: 'white',
  number: 'magenta',
  boolean: 'cyan',
  null: 'red',
  key: 'purple',
  levelKey: 'teal',
  messageKey: 'darkGreen',
  errorLevel: 'red',
  nonErrorLevel: 'lightTeal',
  nonErrorMessage: 'lightGreen',
  errorMessage: 'red',
  warnLevel: 'yellow',
  fileNameKey: 'darkYellow',
  fileName: 'yellow',
  logCallStackKey: 'blue',
  logCallStack: 'black',
  packageNameKey: 'darkYellow',
  packageName: 'yellow',
  timestampKey: 'pink',
  timestamp: 'lightPink',
  errCallStackKey: 'darkRed',
  errCallStack: 'lightRed',
};

// TODO: this is super beta, consider using Sindre's supports-colors
export function supportsColor() {
  const onHeroku = truth(getEnv('DYNO')) ? true : false;
  const forceNoColor = truth(getEnv('FORCE_NO_COLOR')) ? true : false;
  const forceColor = truth(getEnv('FORCE_COLOR')) ? true : false;
  return (!onHeroku && !forceNoColor) || forceColor;
}

// also counts 'false' as false
function truth(it: any) {
  return it && it !== 'false' ? true : false;
}

// TODO:colors: support colorizing specific fields like "message"
// TODO:colors: add support for deserializing circual references by incorporating and using 'json-stringify-safe' that i userd here elsewhere but now commented out
// TODO:colors: add support to toggle colors as well as JSON formatting independently

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

function getKeyColorCode(normalizedStringText: string): ColorItemName {
  switch (normalizedStringText) {
    case '"level"':
      return 'levelKey';
    case '"message"':
      return 'messageKey';
    case '"@filename"':
      return 'fileNameKey';
    case '"@logcallstack"':
      return 'logCallStackKey';
    case '"@packagename"':
      return 'packageNameKey';
    case '"@timestamp"':
      return 'timestampKey';
    case '"errcallstack"':
      return 'errCallStackKey';
    default:
      return 'key';
  }
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
        colorCode = getKeyColorCode(scannedToken.normalizedStringText);
        previousKeyName = scannedToken.normalizedStringText;
        previousTokenWasKey = true;
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
