import { jsonStringifySafe } from '../json-stringify-safe/stringify-safe';

export interface IDefaultColorMap {
  black: string;
  red: string;
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
  logCallStack: 'lightBlue',
  packageNameKey: 'darkYellow',
  packageName: 'yellow',
  timestampKey: 'pink',
  timestamp: 'lightPink',
};

// TODO: this is super beta, consider using Sindre's supports-colors
export function supportsColor() {
  const onHeroku = truth(process.env.DYNO) ? true : false;
  const forceNoColor = truth(process.env.FORCE_NO_COLOR) ? true : false;
  const forceColor = truth(process.env.FORCE_COLOR) ? true : false;
  return (!onHeroku && !forceNoColor) || forceColor;
}

// also counts 'false' as false
function truth(it: any) {
  return it && it !== 'false' ? true : false;
}

// TODO:colors: support colorizing specific fields like "message"
// TODO:colors: add support for deserializing circual references by incorporating and using 'json-stringify-safe' that i userd here elsewhere but now commented out
// TODO:colors: add support to toggle colors as well as JSON formatting independently

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
  let previousMatchedValue: string = '';
  let isErrorLevel = false;
  let isWarnLevel = false;
  let json: string;
  if (supportsColor()) {
    if (typeof jsonInput !== 'string') json = jsonStringifySafe(jsonInput, undefined, spacing);
    else json = jsonStringifySafe(JSON.parse(jsonInput), undefined, spacing);
    return (
      (colorMap as any)[colors.separator] +
      json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match: string) => {
        let colorCode: ColorItemName = 'number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            colorCode = 'key';
            // If key is "level" handle it with special color
            if (/\"level\"/i.test(match)) {
              colorCode = 'levelKey';
            }
            // If key is "message" handle it with special color
            if (/\"message\"/i.test(match)) {
              colorCode = 'messageKey';
            }
            if (/\"@filename\"/i.test(match)) {
              colorCode = 'fileNameKey';
            }
            if (/\"@logCallStack\"/i.test(match)) {
              colorCode = 'logCallStackKey';
            }
            if (/\"@packageName\"/i.test(match)) {
              colorCode = 'packageNameKey';
            }
            if (/\"@timestamp\"/i.test(match)) {
              colorCode = 'timestampKey';
            }
          } else {
            colorCode = 'string';
            // If the key is "level" then handle value with special color
            if (/\"level\"/i.test(previousMatchedValue)) {
              if (/\"error\"/i.test(match)) {
                colorCode = 'errorLevel';
                isErrorLevel = true;
              } else if (/\"warn\"/i.test(match)) {
                colorCode = 'warnLevel';
                isWarnLevel = true;
              } else {
                colorCode = 'nonErrorLevel';
              }
            }
            // if the key is "message" then handle value with special color
            if (/\"message\"/i.test(previousMatchedValue)) {
              if (isErrorLevel) {
                colorCode = 'errorMessage';
              } else if (isWarnLevel) {
                colorCode = 'warnLevel';
              } else {
                colorCode = 'nonErrorMessage';
              }
            }
            if (/\"@filename\"/i.test(previousMatchedValue)) {
              colorCode = 'fileName';
            }
            if (/\"@logCallStack\"/i.test(previousMatchedValue)) {
              colorCode = 'logCallStack';
            }
            if (/\"@packageName\"/i.test(previousMatchedValue)) {
              colorCode = 'packageName';
            }
            if (/\"@timestamp\"/i.test(previousMatchedValue)) {
              colorCode = 'timestamp';
            }
          }
        } else if (/true|false/.test(match)) {
          colorCode = 'boolean';
        } else if (/null/.test(match)) {
          colorCode = 'null';
        }
        const color = (colorMap as any)[(colors as any)[colorCode]] || '';
        previousMatchedValue = match;
        return `\x1b[0m${color}${match}${(colorMap as any)[colors.separator]}`;
      }) +
      '\x1b[0m'
    );
  } else {
    if (typeof jsonInput !== 'string') json = jsonStringifySafe(jsonInput, undefined, spacing);
    else json = jsonStringifySafe(JSON.parse(jsonInput), undefined, spacing);
    return json;
  }
}
