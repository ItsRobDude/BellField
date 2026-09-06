import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const databaseUrl =
  process.env.DATABASE_URL?.trim() || readLocalEnvValue('DATABASE_URL') || defaultDatabaseUrl;

// Same precedence as the apps' dev-only local env loading: shell first, then
// the gitignored root .env, then the documented development default.
function readLocalEnvValue(name) {
  const envFile = path.join(repoRoot, '.env');
  if (!existsSync(envFile)) {
    return undefined;
  }
  return parseEnv(readFileSync(envFile, 'utf8'))[name]?.trim() || undefined;
}

// corepack resolves the pnpm version pinned in package.json; a bare `pnpm`
// would pick up whatever global copy happens to be first on PATH.
const result = spawnSync('corepack', ['pnpm', '--filter', '@bellfield/api', 'migration:up'], {
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  },
  shell: process.platform === 'win32',
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Failed to run local migrations: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
