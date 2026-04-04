import { getEnv } from './get-env';

export function NewLineCharacter() {
  const val = getEnv('CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS');
  if (val && val.toLowerCase() === 'true') {
    return ' - ';
  } else {
    return '\n';
  }
}
