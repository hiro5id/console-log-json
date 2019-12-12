import appRootPath from 'app-root-path';
import callsites from 'callsites';
import * as path from 'path';

export function getCallingFilename(): string | null {
  const callsitesList = callsites();
  const callsite = callsitesList[3];
  let name: string | null = callsite.getFileName();
  if (name) {
    name = name.replace(path.join(appRootPath.toString(), '..'), '');
  }
  return name;
}
