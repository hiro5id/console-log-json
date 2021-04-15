import appRootPath from 'app-root-path';
import * as path from 'path';
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
    // noinspection UnnecessaryLocalVariableJS
    const linesWithoutFullPath = linesWithoutLocalFiles.map((m) => m.replace(path.join(appRootPath.toString(), '..'), ''));
    return linesWithoutFullPath;
  }
}
