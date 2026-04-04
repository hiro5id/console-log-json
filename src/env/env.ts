export class Env {
  private findOptionalEnvFile(fs: any, path: any, startPath: string): string | null {
    if (!fs.existsSync(startPath) || startPath === '/') {
      return null;
    }

    const files = fs.readdirSync(startPath);
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i]);
      const stat = fs.lstatSync(filename);
      if (!stat.isDirectory()) {
        if (filename.toLowerCase().endsWith('.env')) {
          return filename;
        }
      }
    }
    // Disable recursive searching for .env file due to issue: https://github.com/hiro5id/console-log-json/issues/24
    // return this.findOptionalEnvFile(fs, path, path.resolve(startPath, '../'));
    return null;
  }

  public loadDotEnv() {
    try {
      if (typeof require === 'undefined' || typeof process === 'undefined') {
        return; // Browser: no .env loading
      }
      const fs = require('fs');
      const path = require('path');
      const searchForEnvFileStartingInDirectory = process.cwd();
      const optionalEnvFile = this.findOptionalEnvFile(fs, path, searchForEnvFileStartingInDirectory);
      if (optionalEnvFile != null && optionalEnvFile.length > 0) {
        require('dotenv').config({ path: optionalEnvFile });
      } else {
        require('dotenv').config();
      }
    } catch (_) {
      /* dotenv, fs, or path not available */
    }
  }
}
