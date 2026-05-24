import { spawnSync } from 'node:child_process';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

const result = spawnSync('pnpm', ['--filter', '@bellfield/api', 'migration:up'], {
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
