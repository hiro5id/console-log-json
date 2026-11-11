// Builds the ES module entry point (dist/esm/index.mjs) and its ESM type entry (dist/esm/index.d.mts).
// The per-module .d.ts files are emitted afterwards by `tsc -p tsconfig.esm.json --emitDeclarationOnly`.
const esbuild = require('esbuild');
const fs = require('fs');

// The library loads optional Node modules (fs, path, source-map-support) with require()
// inside try/catch, so it degrades gracefully in browsers. An ES module has no `require`,
// and esbuild's fallback throws when called, so on Node every one of those features was
// silently disabled in the ESM build. The banner gives the bundle a real `require`:
//
// - Node >= 20.16 / 22.3: synchronously, via process.getBuiltinModule('module').
// - Older Node: asynchronously, via import('module'). esbuild's require shim checks for
//   `require` on every call, so calls made after the import resolves work. Code that ran
//   at load time (installing source-map-support) is re-run here once require exists.
// - Browsers and other runtimes: `require` stays undefined and the existing guards apply.
//
// A static `import { createRequire } from 'module'` would be simpler, but it would break
// browser bundlers that resolve the ESM build, so the banner avoids any static import.
//
// __console_log_json_module_url__ lets the library recognize its own stack frames by file
// (import.meta is not reachable from eval, so the library can't read it itself).
const banner = [
  'var __console_log_json_module_url__ = import.meta.url;',
  'var require = (function () {',
  '  try {',
  "    var m = typeof process !== 'undefined' && process && typeof process.getBuiltinModule === 'function' ? process.getBuiltinModule('module') : undefined;",
  "    return m && typeof m.createRequire === 'function' ? m.createRequire(__console_log_json_module_url__) : undefined;",
  '  } catch (_) {',
  '    return undefined;',
  '  }',
  '})();',
  "if (require === undefined && typeof process !== 'undefined' && process && process.versions && process.versions.node) {",
  '  try {',
  "    new Function('specifier', 'return import(specifier)')('module').then(function (ns) {",
  "      var m = ns && typeof ns.createRequire === 'function' ? ns : ns && ns.default;",
  "      if (m && typeof m.createRequire === 'function') {",
  '        require = m.createRequire(__console_log_json_module_url__);',
  '        try {',
  "          require('source-map-support').install({ hookRequire: true });",
  '        } catch (_) {',
  '          /* optional dependency not installed */',
  '        }',
  '      }',
  '    }, function () {});',
  '  } catch (_) {',
  '    /* dynamic import not available */',
  '  }',
  '}',
].join('\n');

esbuild.buildSync({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/esm/index.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  sourcemap: true,
  target: 'es2017',
  banner: { js: banner },
  // Optional dependency: load the installed package at runtime instead of bundling a copy.
  external: ['source-map-support'],
});

// The package has no "type": "module", so TypeScript would read dist/esm/index.d.ts as
// CommonJS and accept a default import that fails at runtime. A .d.mts entry is always ESM.
fs.writeFileSync('dist/esm/index.d.mts', "export * from './index.js';\n");
