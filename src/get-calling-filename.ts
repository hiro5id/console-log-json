import appRootPath from 'app-root-path';
import callsites from 'callsites';

export function getCallingFilename(): string | null {
  const callsitesList = callsites();
  const callsite = callsitesList[3];
  let name: string | null = callsite.getFileName();
  if (name) {
    name = name.replace(appRootPath.toString(), '');
  }
  return name;
}
