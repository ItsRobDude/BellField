import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootGeneratedDirectories = ['coverage', 'release'];
const appGeneratedDirectories = ['.expo', '.next', '.turbo', 'dist'];
const packageGeneratedDirectories = ['dist'];
const rootGeneratedPrefixes = ['bellfield-office-web-deploy-', 'bellfield-release-publish-'];

function childDirectories(root, parentName, generatedNames) {
  const parent = join(root, parentName);
  if (!existsSync(parent)) {
    return [];
  }

  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      generatedNames.map((generatedName) => join(parent, entry.name, generatedName))
    );
}

export function collectGeneratedDirectories(root = defaultRepoRoot) {
  const resolvedRoot = resolve(root);
  const prefixedDirectories = readdirSync(resolvedRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && rootGeneratedPrefixes.some((prefix) => entry.name.startsWith(prefix))
    )
    .map((entry) => join(resolvedRoot, entry.name));

  return [
    ...rootGeneratedDirectories.map((name) => join(resolvedRoot, name)),
    ...childDirectories(resolvedRoot, 'apps', appGeneratedDirectories),
    ...childDirectories(resolvedRoot, 'packages', packageGeneratedDirectories),
    ...prefixedDirectories
  ]
    .filter((candidate) => existsSync(candidate))
    .sort((left, right) => left.localeCompare(right));
}

function assertSafeGeneratedDirectory(root, candidate) {
  const candidateRelative = relative(resolve(root), resolve(candidate));
  if (!candidateRelative || candidateRelative.startsWith('..')) {
    throw new Error(`Refusing to clean a path outside the repository: ${candidate}`);
  }
  if (lstatSync(candidate).isSymbolicLink()) {
    throw new Error(`Refusing to clean a generated-directory symlink: ${candidateRelative}`);
  }
  return candidateRelative;
}

export function cleanGeneratedDirectories({ root = defaultRepoRoot, dryRun, log = console.log }) {
  if (typeof dryRun !== 'boolean') {
    throw new TypeError('cleanGeneratedDirectories requires an explicit dryRun boolean.');
  }

  const generatedDirectories = collectGeneratedDirectories(root);
  for (const candidate of generatedDirectories) {
    const candidateRelative = assertSafeGeneratedDirectory(root, candidate);
    if (dryRun) {
      log(`[dry-run] ${candidateRelative}`);
      continue;
    }
    rmSync(candidate, { force: true, recursive: true });
    log(`[removed] ${candidateRelative}`);
  }

  if (generatedDirectories.length === 0) {
    log('No known generated directories are present.');
  }
  return generatedDirectories;
}

function runCli() {
  const flags = new Set(process.argv.slice(2));
  const dryRun = flags.has('--dry-run');
  const apply = flags.has('--apply');
  const unknownFlags = [...flags].filter((flag) => flag !== '--dry-run' && flag !== '--apply');

  if (unknownFlags.length > 0 || dryRun === apply) {
    console.error('Usage: pnpm clean:generated --dry-run | pnpm clean:generated --apply');
    process.exitCode = 1;
    return;
  }

  cleanGeneratedDirectories({ dryRun });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
