import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const defaultBinDir = path.join(localAppData, 'Programs', 'PostgreSQL', '16.14', 'pgsql', 'bin');
const postgresBinDir = process.env.POSTGRES_BIN || defaultBinDir;
const dataDir = process.env.BELLFIELD_POSTGRES_DATA || path.join(localAppData, 'BellField', 'postgres-data');
const pgCtlPath = path.join(postgresBinDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');

if (!existsSync(pgCtlPath) || !existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log('Local PostgreSQL is not initialized for BellField.');
  process.exit(0);
}

const result = spawnSync(pgCtlPath, ['-D', dataDir, 'stop', '-m', 'fast'], {
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  console.error(`Failed to stop local PostgreSQL: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
