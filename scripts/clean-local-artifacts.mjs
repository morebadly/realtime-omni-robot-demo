#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const targets = [
  'dist',
  'node_modules',
  'package-lock.json',
  'localdev-mock.out.log',
  'localdev-mock.err.log',
  'vite-dev.out.log',
  'vite-dev.err.log'
];

for (const target of targets) {
  const absolute = path.join(projectRoot, target);
  if (!fs.existsSync(absolute)) {
    console.log(`skip ${target}`);
    continue;
  }
  fs.rmSync(absolute, { recursive: true, force: true });
  console.log(`removed ${target}`);
}

console.log('Local generated artifacts cleaned. Source files were not changed.');
