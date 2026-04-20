import { getEnv } from './get-env';

let cachedValue: string | null = null;
let noNewLineCharactersOverride: boolean | undefined;

export function NewLineCharacter() {
  if (cachedValue !== null) {
    return cachedValue;
  }

  const noNewLineCharactersEnabled =
    noNewLineCharactersOverride !== undefined
      ? noNewLineCharactersOverride
      : (() => {
          const val = getEnv('CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS');
          return !!val && val.toLowerCase() === 'true';
        })();

  if (noNewLineCharactersEnabled) {
    cachedValue = ' - ';
  } else {
    cachedValue = '\n';
  }
  return cachedValue;
}

export function configureNewLineCharacter(noNewLineCharacters?: boolean) {
  noNewLineCharactersOverride = noNewLineCharacters;
  cachedValue = null;
}

/**
 * Reset the cached value. Called when env config is reloaded.
 */
export function resetNewLineCharacterCache() {
  cachedValue = null;
  noNewLineCharactersOverride = undefined;
}
