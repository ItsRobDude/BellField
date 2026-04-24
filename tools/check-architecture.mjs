import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoots = ['apps', 'packages'];
const ignoredSegments = new Set(['node_modules', 'dist', '.next', '.expo', '.turbo']);
const sourceExtensions = new Set(['.ts', '.tsx']);
const clientApiHelpers = new Set([
  'apps/office-web/src/lib/identity-api.ts',
  'apps/office-web/src/lib/operations-api.ts',
  'apps/field-mobile/src/lib/identity-api.ts',
  'apps/field-mobile/src/lib/operations-api.ts'
]);

const contractNames = readContractExportNames();
const failures = [];

for (const filePath of listSourceFiles(sourceRoots)) {
  const relativePath = toRepoPath(filePath);
  const content = readFileSync(filePath, 'utf8');

  checkImportBoundaries(filePath, relativePath, content);

  if (clientApiHelpers.has(relativePath)) {
    checkClientApiTypeRedeclarations(relativePath, content);
  }
}

if (failures.length > 0) {
  console.error('Architecture check failed:');
  for (const failure of failures) {
    console.error(`- ${failure.rule}: ${failure.file}${failure.line ? `:${failure.line}` : ''} - ${failure.message}`);
  }
  process.exit(1);
}

console.log('Architecture check passed.');

function readContractExportNames() {
  const contractIndex = path.join(repoRoot, 'packages', 'contracts', 'src', 'index.ts');
  const content = readFileSync(contractIndex, 'utf8');
  const names = new Set();
  const exportPattern = /^export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/gm;
  let match;

  while ((match = exportPattern.exec(content)) !== null) {
    names.add(match[1]);
  }

  return names;
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

function checkImportBoundaries(filePath, relativePath, content) {
  for (const importRef of parseImportRefs(content)) {
    const targetPath = resolveImportPath(filePath, importRef.specifier);

    if (relativePath.startsWith('apps/')) {
      const sourceApp = relativePath.split('/')[1];
      const targetApp = getTargetApp(importRef.specifier, targetPath);

      if (targetApp && targetApp !== sourceApp) {
        addFailure('no-cross-app-imports', relativePath, importRef.line, `app code must not import ${targetApp}`);
      }
    }

    if (relativePath.startsWith('packages/') && importTouchesApps(importRef.specifier, targetPath)) {
      addFailure('shared-packages-do-not-import-apps', relativePath, importRef.line, 'shared packages must not import app or API internals');
    }

    if (
      relativePath.startsWith('apps/api/src/modules/') &&
      !relativePath.startsWith('apps/api/src/modules/company-data/') &&
      isCompanyDataRepositoryImport(importRef.specifier, targetPath)
    ) {
      addFailure(
        'company-data-repositories-are-private',
        relativePath,
        importRef.line,
        'use company-data public services/types instead of importing repositories directly'
      );
    }
  }
}

function parseImportRefs(content) {
  const refs = [];
  const importPattern = /^\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/gm;
  let match;

  while ((match = importPattern.exec(content)) !== null) {
    refs.push({
      specifier: match[1],
      line: content.slice(0, match.index).split('\n').length
    });
  }

  return refs;
}

function resolveImportPath(filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  return toRepoPath(path.resolve(path.dirname(filePath), specifier));
}

function getTargetApp(specifier, targetPath) {
  if (specifier.startsWith('@bellfield/')) {
    const packageName = specifier.split('/')[1];
    if (packageName === 'api') return 'api';
    if (packageName === 'office-web') return 'office-web';
    if (packageName === 'field-mobile') return 'field-mobile';
    if (packageName === 'worker') return 'worker';
  }

  if (!targetPath?.startsWith('apps/')) {
    return null;
  }

  return targetPath.split('/')[1];
}

function importTouchesApps(specifier, targetPath) {
  return (
    specifier.startsWith('apps/') ||
    specifier.startsWith('@bellfield/api') ||
    specifier.startsWith('@bellfield/office-web') ||
    specifier.startsWith('@bellfield/field-mobile') ||
    specifier.startsWith('@bellfield/worker') ||
    targetPath?.startsWith('apps/')
  );
}

function isCompanyDataRepositoryImport(specifier, targetPath) {
  const normalizedSpecifier = specifier.replaceAll('\\', '/');
  const normalizedTarget = targetPath ?? '';

  return (
    /company-data\/[^/]*repository$/.test(normalizedSpecifier) ||
    /company-data\/[^/]*repository$/.test(normalizedTarget)
  );
}

function checkClientApiTypeRedeclarations(relativePath, content) {
  const typePattern = /^export\s+(?:interface|type)\s+([A-Za-z0-9_]+)\s*(?:=|\{)/gm;
  let match;

  while ((match = typePattern.exec(content)) !== null) {
    const typeName = match[1];

    if (contractNames.has(typeName)) {
      addFailure(
        'client-api-uses-contract-types',
        relativePath,
        content.slice(0, match.index).split('\n').length,
        `${typeName} is exported by @bellfield/contracts and must not be redeclared in a client API helper`
      );
    }
  }
}

function addFailure(rule, file, line, message) {
  failures.push({ rule, file, line, message });
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}
