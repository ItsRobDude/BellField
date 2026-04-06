import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const migrationsDir = path.resolve(__dirname, '../../src/database/migrations');

mkdirSync(migrationsDir, { recursive: true });

export function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is required.');
    process.exit(1);
  }

  return databaseUrl;
}

export function runPsql(
  args,
  { databaseUrl = process.env.DATABASE_URL, allowFailure = false } = {}
) {
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(`Error: failed to run psql (${result.error.message}).`);
    process.exit(1);
  }

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

export function queryPsql(
  sql,
  { databaseUrl = process.env.DATABASE_URL, allowFailure = false } = {}
) {
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(`Error: failed to run psql (${result.error.message}).`);
    process.exit(1);
  }

  if (!allowFailure && result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return (result.stdout ?? '').trim();
}

export function listUpMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.up.sql'))
    .sort();
}
