import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoots = [
  'apps/office-web/app',
  'apps/office-web/src',
  'apps/field-mobile/app',
  'apps/field-mobile/src'
];
const sourceExtensions = new Set(['.ts', '.tsx']);
const ignoredSegments = new Set(['__tests__']);
const ignoredFilePatterns = [/\.test\.[tj]sx?$/];
const bannedCopyPatterns = [
  { label: 'milestone-foundation', pattern: /\bMilestone foundation\b/i },
  { label: 'crm-backbone', pattern: /\bCRM backbone\b/i },
  { label: 'selected-detail', pattern: /\bSelected detail\b/i },
  { label: 'office-shell', pattern: /\boffice shell\b/i },
  { label: 'field-shell', pattern: /\bfield shell\b/i },
  { label: 'now-live', pattern: /\bnow live\b/i },
  { label: 'now-persist', pattern: /\bnow persist\b/i },
  { label: 'now-leads-into', pattern: /\bnow leads into\b/i },
  { label: 'serialized-unit-mindset', pattern: /\bSerialized-unit mindset\b/i },
  { label: 'location-first-badge', pattern: /\bLocation first\b/ },
  { label: 'replacement-equipment-id', pattern: /\bReplacement equipment id\b/i },
  { label: 'scaffold-copy', pattern: /\bscaffold(?:ing|ed)?\b/i }
];

const failures = [];

for (const filePath of listSourceFiles(sourceRoots)) {
  const relativePath = toRepoPath(filePath);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const bannedCopy of bannedCopyPatterns) {
      if (bannedCopy.pattern.test(line)) {
        failures.push({
          label: bannedCopy.label,
          line: index + 1,
          path: relativePath,
          text: line.trim()
        });
      }
    }
  });
}

if (failures.length > 0) {
  console.error('UI copy check failed:');
  for (const failure of failures) {
    console.error(`- ${failure.label}: ${failure.path}:${failure.line} - ${failure.text}`);
  }
  process.exit(1);
}

console.log('UI copy check passed.');

function listSourceFiles(rootNames) {
  const files = [];

  for (const rootName of rootNames) {
    const rootPath = path.join(repoRoot, rootName);
    if (existsSync(rootPath)) {
      walk(rootPath, files);
    }
  }

  return files;
}

function walk(currentPath, files) {
  const stats = statSync(currentPath);

  if (stats.isDirectory()) {
    const segment = path.basename(currentPath);
    if (ignoredSegments.has(segment)) {
      return;
    }

    for (const entry of readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), files);
    }

    return;
  }

  if (!stats.isFile() || !sourceExtensions.has(path.extname(currentPath))) {
    return;
  }

  if (ignoredFilePatterns.some((pattern) => pattern.test(currentPath))) {
    return;
  }

  files.push(currentPath);
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}
