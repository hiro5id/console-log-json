export function NewLineCharacter() {
  const { CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS } = process.env;
  if (CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS && CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS.toLowerCase() === 'true') {
    return ' - ';
  } else {
    return '\n';
  }
}
