#!/usr/bin/env node
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
const expectedTitle = `Realtime Omni Robot Demo v${version}`;
const failures = [];

const expectIncludes = (file, text, description = text) => {
  const content = read(file);
  if (!content.includes(text)) {
    failures.push(`${file} missing ${description}`);
  }
};

expectIncludes('README.md', `# ${expectedTitle}`, 'README version title');
expectIncludes('AGENTS.md', `Current version: v${version}.`, 'AGENTS current version');
expectIncludes('docs/ARCHITECTURE.md', `# 架构说明 v${version}`, 'ARCHITECTURE version title');
expectIncludes('docs/IMPLEMENTATION_PLAN.md', `# 技术落地路线 v${version}`, 'IMPLEMENTATION_PLAN version title');

for (const kind of ['RELEASE_NOTES', 'UPDATE_GUIDE']) {
  const file = `docs/${kind}_v${version}.md`;
  if (!fs.existsSync(file)) {
    failures.push(`missing ${file}`);
  }
}

const forbiddenTrackedArtifacts = [
  'node_modules/',
  'dist/',
  'package-lock.json',
  '.env',
  '.env.local'
];
for (const artifact of forbiddenTrackedArtifacts) {
  expectIncludes('.gitignore', artifact, `.gitignore entry ${artifact}`);
}

if (failures.length) {
  console.error('Version doctor failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Version doctor passed for v${version}.`);
