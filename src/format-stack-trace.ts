import { getAppRootParentDir } from './get-app-root';
import { NewLineCharacter } from './new-line-character';

export class FormatStackTrace {
  public static readonly divider = '    at';
  public static toNewLines(stack: string): string {
    const lines = this.toArray(stack);
    return restoreCausedBySeparator(lines.join(`${NewLineCharacter()}${this.divider}`));
  }

  public static toArray(stack: string): string[] {
    return this.stripAppParentDir(this.toUnstrippedArray(stack));
  }

  /** Stack lines with installed-library frames removed, but paths still absolute. */
  public static toUnstrippedArray(stack: string): string[] {
    let noNewLines = stack.replace(/\n/gi, '');
    noNewLines = noNewLines.replace(/\r/gi, '');
    const lines = noNewLines.split(this.divider);
    // this filters out lines relating to this package when referenced from other projects
    // (either slash direction: Windows CommonJS frames use backslashes)
    return lines.filter((m) => m.match(/node_modules[\\/].*console-log-json[\\/].*/gi) == null);
  }

  /** Removes the directory containing the project root from each line. */
  public static stripAppParentDir(lines: string[]): string[] {
    const parentPath = getAppRootParentDir();
    if (parentPath) {
      const parentForms = getParentPathForms(parentPath);
      return lines.map((m) => stripFirstParentPathForm(m, parentForms));
    }
    return lines;
  }
}

/**
 * Splitting on the "    at" divider drops the line break that ErrorWithContext puts before
 * "Caused By:", which glued it onto the previous frame ("...:1:1)Caused By: Error: ...").
 * Put the separator back.
 */
function restoreCausedBySeparator(stack: string): string {
  return stack.replace(/\s*(?: - )?Caused By: /g, `${NewLineCharacter()}Caused By: `);
}

/**
 * Exported for tests. The ways the parent dir can appear in a stack frame: the native path
 * (CommonJS frames), and its file-URL path (ES module frames are file:// URLs, which use
 * forward slashes, a leading slash before a Windows drive letter, and percent-encoding).
 */
export function getParentPathForms(parentPath: string): string[] {
  const forwardSlashed = parentPath.replace(/\\/g, '/');
  const urlPath = encodeURI(/^[A-Za-z]:/.test(forwardSlashed) ? `/${forwardSlashed}` : forwardSlashed);
  const forms = [parentPath, urlPath, forwardSlashed];
  return forms.filter((form, index) => form.length > 0 && forms.indexOf(form) === index);
}

/** Exported for tests. Removes the first form of the parent dir found in `line`. */
export function stripFirstParentPathForm(line: string, parentForms: string[]): string {
  for (const form of parentForms) {
    if (line.includes(form)) {
      return line.replace(form, '');
    }
  }
  return line;
}
