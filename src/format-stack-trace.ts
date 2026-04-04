import { getAppRoot } from './get-app-root';
import { NewLineCharacter } from './new-line-character';

export class FormatStackTrace {
  public static readonly divider = '    at';
  public static toNewLines(stack: string): string {
    const lines = this.toArray(stack);
    return lines.join(`${NewLineCharacter()}${this.divider}`);
  }

  public static toArray(stack: string): string[] {
    let noNewLines = stack.replace(/\n/gi, '');
    noNewLines = noNewLines.replace(/\r/gi, '');
    const lines = noNewLines.split(this.divider);
    // this filters out lines relating to this package when referenced from other projects
    const linesWithoutLocalFiles = lines.filter((m) => m.match(/node_modules\/.*console-log-json\/.*/gi) == null);

    const root = getAppRoot();
    if (root) {
      try {
        const path = require('path');
        const parentPath = path.join(root, '..');
        return linesWithoutLocalFiles.map((m) => m.replace(parentPath, ''));
      } catch (_) {
        /* path module not available */
      }
    }
    return linesWithoutLocalFiles;
  }
}
