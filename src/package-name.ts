type ImportModuleFunction = (specifier: string) => Promise<any | null>;

function isNodeLikeRuntime(): boolean {
  return typeof process !== 'undefined' && typeof process.cwd === 'function';
}

function normalizeImportedModule(moduleNamespace: any): any {
  if (moduleNamespace == null) {
    return null;
  }
  return moduleNamespace.default || moduleNamespace;
}

function findPackageRoot(fs: any, path: any): string {
  let dir: string = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function readPackageNameFromModules(fs: any, path: any): string {
  const root = findPackageRoot(fs, path);
  if (!root) {
    return '';
  }

  const packageJsonText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageJsonText);
  return typeof packageJson.name === 'string' ? packageJson.name : '';
}

export function getPackageNameSync(): string {
  try {
    if (!isNodeLikeRuntime() || typeof require === 'undefined') {
      return '';
    }

    const fs = require('fs');
    const path = require('path');
    return readPackageNameFromModules(fs, path);
  } catch (_) {
    return '';
  }
}

export async function dynamicImportModule(specifier: string): Promise<any | null> {
  try {
    return await new Function('moduleName', 'return import(moduleName);')(specifier); // tslint:disable-line:no-function-constructor-with-string-args
  } catch (_) {
    try {
      return await new Function('moduleName', 'return import("node:" + moduleName);')(specifier); // tslint:disable-line:no-function-constructor-with-string-args
    } catch (_) {
      return null;
    }
  }
}

export async function getPackageNameAsync(importModule: ImportModuleFunction = dynamicImportModule): Promise<string> {
  try {
    if (!isNodeLikeRuntime()) {
      return '';
    }

    const [fsNamespace, pathNamespace] = await Promise.all([importModule('fs'), importModule('path')]);
    const fs = normalizeImportedModule(fsNamespace);
    const path = normalizeImportedModule(pathNamespace);
    if (fs == null || path == null) {
      return '';
    }

    return readPackageNameFromModules(fs, path);
  } catch (_) {
    return '';
  }
}
