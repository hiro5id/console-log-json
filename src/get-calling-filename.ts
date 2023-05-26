import appRootPath from 'app-root-path';
import * as path from 'path';
import callsites from './callsites/get-callsites';

export function getCallingFilename(): string | null {
  const callsitesList = callsites();
  const callsite = callsitesList[3];
  let name: string | null = callsite.getFileName();
  if (name) {
    name = name.replace(path.join(appRootPath.toString(), '..'), '');
  }
  return name;
}
