import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

describe('README environment variable coverage', () => {
  it('documents only CONSOLE_LOG_* variables that are referenced by at least one test file', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const readmePath = path.join(projectRoot, 'README.md');
    const testDir = path.join(projectRoot, 'test');

    const readme = fs.readFileSync(readmePath, 'utf8');
    const documentedVariables = Array.from(new Set(readme.match(/CONSOLE_LOG_[A-Z0-9_]+/g) || [])).sort();

    const testFiles = fs
      .readdirSync(testDir)
      .filter((fileName) => fileName.endsWith('.test.ts') && fileName !== 'readme-config-coverage.test.ts')
      .sort();

    const testContents = testFiles.map((fileName) => ({
      fileName,
      content: fs.readFileSync(path.join(testDir, fileName), 'utf8'),
    }));

    const uncoveredVariables = documentedVariables.filter((variableName) => {
      return !testContents.some((testFile) => testFile.content.includes(variableName));
    });

    expect(uncoveredVariables).to.eql([]);
  });
});
