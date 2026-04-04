import { getAppRoot } from './get-app-root';
import callsites from './callsites/get-callsites';

export function getCallingFilename(): string | null {
  const callsitesList = callsites();
  const callsite = callsitesList[3];
  let name: string | null = callsite.getFileName();
  if (name) {
    const root = getAppRoot();
    if (root) {
      try {
        const path = require('path');
        name = name.replace(path.join(root, '..'), '');
      } catch (_) {
        /* path module not available */
      }
    }
  }
  return name;
}
