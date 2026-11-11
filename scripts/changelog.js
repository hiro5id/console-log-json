#!/usr/bin/env node
// CHANGELOG.md helpers for .github/workflows/publish.yml.
//
// Release headings look like "## 6.5.0" (also "## v6.5.0", "## [6.5.0]", "## 6.5.0 (2026-11-20)").
// Once a version is published, the workflow appends " - deployed": "## 6.5.0 - deployed".
//
//   node scripts/changelog.js next [file]           print the version of the one heading not yet deployed
//   node scripts/changelog.js notes <version> [file] print the section text for <version>
//   node scripts/changelog.js mark <version> [file]  append " - deployed" to <version>'s heading
'use strict';

const fs = require('fs');

const HEADING = /^## \[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?(?=\s|$)(.*)$/;
const DEPLOYED = /\s-\sdeployed\s*$/i;

function readHeadings(lines) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match) {
      headings.push({ index, line, version: match[1], deployed: DEPLOYED.test(match[2]) });
    }
  });
  return headings;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function findHeading(headings, version) {
  const heading = headings.find((h) => h.version === version);
  if (!heading) fail(`CHANGELOG.md has no "## ${version}" heading`);
  return heading;
}

const [command, arg, fileArg] = process.argv.slice(2);
const file = (command === 'next' ? arg : fileArg) || 'CHANGELOG.md';
const text = fs.readFileSync(file, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/);
const headings = readHeadings(lines);

if (command === 'next') {
  const pending = headings.filter((h) => !h.deployed);
  if (pending.length === 0) {
    fail('Every version in CHANGELOG.md is marked " - deployed". Add a "## x.y.z" section for the next release at the top.');
  }
  if (pending.length > 1) {
    fail(
      'More than one CHANGELOG.md version is not marked " - deployed"; release them one at a time:\n' +
        pending.map((h) => `  line ${h.index + 1}: ${h.line}`).join('\n'),
    );
  }
  process.stdout.write(pending[0].version + '\n');
} else if (command === 'notes') {
  const heading = findHeading(headings, arg);
  const next = headings.find((h) => h.index > heading.index);
  const end = next ? next.index : lines.length;
  process.stdout.write(lines.slice(heading.index + 1, end).join('\n').trim() + '\n');
} else if (command === 'mark') {
  const heading = findHeading(headings, arg);
  if (!heading.deployed) {
    lines[heading.index] = heading.line.replace(/\s+$/, '') + ' - deployed';
    fs.writeFileSync(file, lines.join(eol));
  }
  process.stdout.write(lines[heading.index] + '\n');
} else {
  fail('Usage: node scripts/changelog.js next [file] | notes <version> [file] | mark <version> [file]');
}
