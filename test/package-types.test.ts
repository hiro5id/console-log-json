/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Verifies the type declarations that consumers actually receive from the
 * published tarball (as produced by `npm pack`), for both the `import` and
 * `require` export conditions.
 *
 * Regression: the `files` whitelist in package.json only shipped
 * dist/esm/index.d.ts, not the declarations it re-exports from, so every ESM
 * import silently became `any` (with skipLibCheck) or failed with TS2307.
 * The `import` types entry is dist/esm/index.d.mts so TypeScript treats it as
 * ESM (the package has no "type": "module") and doesn't invent a default export.
 *
 * Requires a prior build (`npm run build`), since it packs the existing dist/.
 */
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Consumer code. The @ts-expect-error line fails with TS2578 ("unused
// directive") if the package's exports resolve to `any`, so a clean compile
// proves the options are genuinely type-checked.
const ESM_CONSUMER = `
import { LoggerAdaptToConsole, ErrorWithContext, LOG_LEVEL } from 'console-log-json';
LoggerAdaptToConsole({ logLevel: LOG_LEVEL.info, transformOutput: (o) => o });
const err: Error = new ErrorWithContext('boom', { a: 1 });
void err;
// @ts-expect-error unknown option must be rejected
LoggerAdaptToConsole({ notARealOption: true });
`;

// dist/esm/index.mjs has no default export, so a default import throws a
// SyntaxError at runtime. TypeScript must reject it too (TS1192); it only
// accepts it if the ESM declarations are mistakenly read as CommonJS.
const ESM_DEFAULT_IMPORT_CONSUMER = `
// @ts-expect-error the ES module build has no default export
import clj from 'console-log-json';
void clj;
`;

const CJS_CONSUMER = `
import cl = require('console-log-json');
cl.LoggerAdaptToConsole({ logLevel: cl.LOG_LEVEL.info, transformOutput: (o) => o });
const err: Error = new cl.ErrorWithContext('boom', { a: 1 });
void err;
// @ts-expect-error unknown option must be rejected
cl.LoggerAdaptToConsole({ notARealOption: true });
`;

describe('published package type declarations', () => {
  let workDir: string;
  let packedFiles: string[];

  beforeAll(() => {
    const esmIndex = path.join(PROJECT_ROOT, 'dist', 'esm', 'index.d.ts');
    if (!fs.existsSync(esmIndex)) {
      throw new Error(`${esmIndex} not found — run "npm run build" before this test`);
    }

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clj-types-'));
    // Run through the shell so npm's Windows .cmd shim works (execFile can't spawn
    // .cmd files on Node >= 18.20 / 20.12). --ignore-scripts keeps any future
    // prepack/prepare/postpack script from running a build or writing to stdout.
    const packOutput = execSync(`npm pack --json --ignore-scripts --pack-destination "${workDir}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const packInfo = JSON.parse(packOutput)[0];
    packedFiles = packInfo.files.map((f: { path: string }) => f.path);

    // Install the tarball the way a consumer would see it.
    const pkgDir = path.join(workDir, 'node_modules', 'console-log-json');
    fs.mkdirSync(pkgDir, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(workDir, packInfo.filename), '-C', pkgDir, '--strip-components=1']);

    // The declarations reference Node types; make @types/node visible to the consumer.
    const typesDir = path.join(workDir, 'node_modules', '@types');
    fs.mkdirSync(typesDir, { recursive: true });
    // 'junction' needs no admin rights on Windows; the type is ignored elsewhere.
    fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules', '@types', 'node'), path.join(typesDir, 'node'), 'junction');

    fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
    fs.writeFileSync(path.join(workDir, 'consumer.mts'), ESM_CONSUMER);
    fs.writeFileSync(path.join(workDir, 'consumer-default.mts'), ESM_DEFAULT_IMPORT_CONSUMER);
    fs.writeFileSync(path.join(workDir, 'consumer.cts'), CJS_CONSUMER);
  }, 60000);

  afterAll(() => {
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  function typeCheck(fileName: string, options: ts.CompilerOptions): string[] {
    const program = ts.createProgram([path.join(workDir, fileName)], {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ['node'],
      typeRoots: [path.join(workDir, 'node_modules', '@types')],
      ...options,
    });
    return ts.getPreEmitDiagnostics(program).map((d) => `${d.file ? path.relative(workDir, d.file.fileName) : ''}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }

  it('ships every declaration file emitted into dist/esm', () => {
    const emitted: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.d\.m?ts$/.test(entry.name)) {
          emitted.push(path.relative(PROJECT_ROOT, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(PROJECT_ROOT, 'dist', 'esm'));

    expect(emitted).to.include('dist/esm/logger.d.ts');
    expect(emitted).to.include('dist/esm/error-with-context.d.ts');
    expect(emitted).to.include('dist/esm/index.d.mts');
    expect(packedFiles).to.include.members(emitted);
  });

  it('type-checks an ES module consumer with moduleResolution nodenext', () => {
    const diagnostics = typeCheck('consumer.mts', {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    });
    expect(diagnostics).to.deep.equal([]);
  }, 60000);

  it('type-checks an ES module consumer with moduleResolution bundler', () => {
    const diagnostics = typeCheck('consumer.mts', {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    expect(diagnostics).to.deep.equal([]);
  }, 60000);

  it('rejects a default import from the ES module build (no default export at runtime)', () => {
    for (const options of [
      { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
      { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
    ]) {
      expect(typeCheck('consumer-default.mts', options)).to.deep.equal([]);
    }
  }, 60000);

  it('type-checks a CommonJS consumer with moduleResolution nodenext', () => {
    const diagnostics = typeCheck('consumer.cts', {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    });
    expect(diagnostics).to.deep.equal([]);
  }, 60000);
});
