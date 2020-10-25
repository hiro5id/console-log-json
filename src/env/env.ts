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
    return this.findOptionalEnvFile(path.resolve(startPath, '../'));
  }

  public loadDotEnv() {
    const optionalEnvFile = this.findOptionalEnvFile(__dirname);
    if (optionalEnvFile != null && optionalEnvFile.length < 0) {
      require('dotenv').config({ path: optionalEnvFile });
    } else {
      require('dotenv').config();
    }
  }
}
