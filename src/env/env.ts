import fs from 'fs';
import path from 'path';

export class Env {
  private findOptionalEnvFile(startPath: string): string | null {
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
    // return this.findOptionalEnvFile(path.resolve(startPath, '../'));
    return null;
  }

  public loadDotEnv() {
    const searchForEnvFileStartingInDirectory = process.cwd();
    const optionalEnvFile = this.findOptionalEnvFile(searchForEnvFileStartingInDirectory);
    if (optionalEnvFile != null && optionalEnvFile.length < 0) {
      require('dotenv').config({ path: optionalEnvFile });
    } else {
      require('dotenv').config();
    }
  }
}
