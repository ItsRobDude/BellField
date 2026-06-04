import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoots = ['apps', 'packages'];
const ignoredSegments = new Set(['node_modules', 'dist', '.next', '.expo', '.turbo', 'coverage']);
const sourceExtensions = new Set(['.ts', '.tsx']);
const reviewLineLimit = 800;
const blockingLineLimit = 1200;

const legacyOversizedFiles = new Map(
  [
    ['apps/api/src/modules/company-data/jobs-data.repository.ts', 1738],
    ['packages/contracts/src/index.ts', 1591],
    ['apps/field-mobile/src/modules/operations/technician-workspace-screen.tsx', 1502],
    ['apps/office-web/src/modules/operations/crm-panel.tsx', 1355],
    ['apps/api/src/modules/company-data/reference-data.repository.ts', 1271],
    ['apps/api/src/modules/jobs-appointments/jobs-appointments.service.ts', 1197],
    ['apps/office-web/src/modules/operations/office-workspace-shell.tsx', 1159],
    ['apps/office-web/src/modules/operations/job-detail-panel.tsx', 855],
    ['apps/office-web/src/lib/operations-api.ts', 1073],
    ['apps/api/src/modules/invoices/invoices.repository.ts', 963]
  ].map(([filePath, maxLines]) => [normalizeRepoPath(filePath), maxLines])
);

const failures = [];
const legacyStillOversized = [];

for (const filePath of listSourceFiles(sourceRoots)) {
  const relativePath = toRepoPath(filePath);

  if (isTestFile(relativePath)) {
    continue;
  }

  const lineCount = countLines(filePath);
  const legacyMaxLines = legacyOversizedFiles.get(relativePath);

  if (legacyMaxLines !== undefined) {
    if (lineCount > legacyMaxLines) {
      addFailure(
        relativePath,
        lineCount,
        `legacy oversized file grew beyond its baseline of ${legacyMaxLines} lines`
      );
    }

    if (lineCount >= reviewLineLimit) {
      legacyStillOversized.push({ file: relativePath, lines: lineCount, maxLines: legacyMaxLines });
    }

    continue;
  }

  if (lineCount >= blockingLineLimit) {
    addFailure(
      relativePath,
      lineCount,
      `new source files at ${blockingLineLimit}+ lines require a deliberate split before merge`
    );
    continue;
  }

  if (lineCount >= reviewLineLimit) {
    addFailure(
      relativePath,
      lineCount,
      `new source files at ${reviewLineLimit}+ lines require an explicit baseline exception or a split`
    );
  }
}

if (failures.length > 0) {
  console.error('File-size check failed:');
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.lines} lines - ${failure.message}`);
  }
  console.error('');
  console.error(
    'Prefer a small extraction. If a large file is intentionally accepted, document it in docs/maintainability-refactor-plan.md and add a baseline entry here.'
  );
  process.exit(1);
}

console.log('File-size check passed.');

if (legacyStillOversized.length > 0) {
  console.log('Legacy oversized files still on the refactor plan:');
  for (const entry of legacyStillOversized.sort((left, right) => right.lines - left.lines)) {
    console.log(`- ${entry.file}: ${entry.lines}/${entry.maxLines} baseline lines`);
  }
}

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

  if (stats.isFile() && sourceExtensions.has(path.extname(currentPath))) {
    files.push(currentPath);
  }
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf8');
  if (content.length === 0) {
    return 0;
  }

  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines.length;
}

function isTestFile(relativePath) {
  return (
    relativePath.includes('/__tests__/') ||
    relativePath.endsWith('.test.ts') ||
    relativePath.endsWith('.test.tsx') ||
    relativePath.endsWith('.spec.ts') ||
    relativePath.endsWith('.spec.tsx')
  );
}

function addFailure(file, lines, message) {
  failures.push({ file, lines, message });
}

function toRepoPath(filePath) {
  return normalizeRepoPath(path.relative(repoRoot, filePath));
}

function normalizeRepoPath(filePath) {
  return filePath.replaceAll('\\', '/');
}
