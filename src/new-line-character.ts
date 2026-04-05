import { getEnv } from './get-env';

let cachedValue: string | null = null;

export function NewLineCharacter() {
  if (cachedValue !== null) {
    return cachedValue;
  }
  const val = getEnv('CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS');
  if (val && val.toLowerCase() === 'true') {
    cachedValue = ' - ';
  } else {
    cachedValue = '\n';
  }
  return cachedValue;
}

/**
 * Reset the cached value. Called when env config is reloaded.
 */
export function resetNewLineCharacterCache() {
  cachedValue = null;
}
