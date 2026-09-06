import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Copies the master local env files (kept outside the repo, shared between
// Rob's PCs) into their gitignored places inside this checkout. Contents are
// never printed. Client apps carry no secrets, so they are seeded from their
// committed examples when missing.
export const DEFAULT_SOURCE_DIR = 'W:/Documents/API Keys/BellField/dev';

export const MASTER_ENV_FILES = [
  { source: 'bellfield-dev.env', target: '.env' },
  { source: 'bellfield-dev-relay.env', target: path.join('apps', 'relay', '.env') }
];

export const EXAMPLE_ENV_FILES = [
  path.join('apps', 'office-web', '.env'),
  path.join('apps', 'field-mobile', '.env')
];

export function planLocalEnvSync({ sourceDir, repoRoot, exists = existsSync }) {
  const actions = [];

  for (const { source, target } of MASTER_ENV_FILES) {
    const from = path.join(sourceDir, source);
    const to = path.join(repoRoot, target);
    actions.push(exists(from) ? { type: 'copy', from, to } : { type: 'missing', from, to });
  }

  for (const target of EXAMPLE_ENV_FILES) {
    const to = path.join(repoRoot, target);
    const from = `${to}.example`;
    if (exists(to)) {
      actions.push({ type: 'keep', from, to });
    } else {
      actions.push(exists(from) ? { type: 'copy', from, to } : { type: 'missing', from, to });
    }
  }

  return actions;
}

export function applyLocalEnvSync(actions, { dryRun = false, copy = copyFileSync } = {}) {
  for (const action of actions) {
    if (action.type !== 'copy' || dryRun) {
      continue;
    }
    mkdirSync(path.dirname(action.to), { recursive: true });
    copy(action.from, action.to);
  }
  return actions;
}

export function describeLocalEnvSync(actions, repoRoot) {
  const relative = (file) => path.relative(repoRoot, file) || '.';
  return actions.map((action) => {
    switch (action.type) {
      case 'copy':
        return `updated ${relative(action.to)} from ${action.from}`;
      case 'keep':
        return `kept existing ${relative(action.to)}`;
      default:
        return `missing source ${action.from} (left ${relative(action.to)} untouched)`;
    }
  });
}

export function runLocalEnvSync({ argv = process.argv.slice(2), env = process.env } = {}) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceDir = env.BELLFIELD_DEV_ENV_DIR?.trim() || DEFAULT_SOURCE_DIR;
  const dryRun = argv.includes('--dry-run');

  if (!existsSync(sourceDir)) {
    console.error(`Local env source folder not found: ${sourceDir}`);
    console.error(
      'Map the shared drive, or set BELLFIELD_DEV_ENV_DIR to the folder holding the master env files.'
    );
    return 1;
  }

  const actions = applyLocalEnvSync(planLocalEnvSync({ sourceDir, repoRoot }), { dryRun });
  console.log(`${dryRun ? 'Would sync' : 'Synced'} local env files from ${sourceDir}:`);
  for (const line of describeLocalEnvSync(actions, repoRoot)) {
    console.log(`- ${line}`);
  }

  return actions.some((action) => action.type === 'missing') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runLocalEnvSync());
}
