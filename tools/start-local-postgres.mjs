import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const postgresPassword = process.env.BELLFIELD_POSTGRES_PASSWORD || 'postgres';
const postgresPort = process.env.BELLFIELD_POSTGRES_PORT || '5432';
const postgresDatabase = process.env.BELLFIELD_POSTGRES_DATABASE || 'bellfield';
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const defaultBinDir = path.join(localAppData, 'Programs', 'PostgreSQL', '16.14', 'pgsql', 'bin');
const postgresBinDir = process.env.POSTGRES_BIN || defaultBinDir;
const dataDir = process.env.BELLFIELD_POSTGRES_DATA || path.join(localAppData, 'BellField', 'postgres-data');
const logDir = process.env.BELLFIELD_POSTGRES_LOG_DIR || path.join(localAppData, 'BellField', 'logs');

function executable(name) {
  return path.join(postgresBinDir, process.platform === 'win32' ? `${name}.exe` : name);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: {
      ...process.env,
      PGPASSWORD: postgresPassword
    }
  });

  if (result.error) {
    throw new Error(`${path.basename(command)} failed: ${result.error.message}`);
  }

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with ${result.status ?? 1}`);
  }

  return result;
}

function requirePostgresBinary() {
  const postgresPath = executable('postgres');

  if (existsSync(postgresPath)) {
    return;
  }

  throw new Error(
    `PostgreSQL binaries were not found at ${postgresBinDir}. Install PostgreSQL 16 locally or set POSTGRES_BIN.`
  );
}

function initializeDataDirectory() {
  if (existsSync(path.join(dataDir, 'PG_VERSION'))) {
    return;
  }

  mkdirSync(path.dirname(dataDir), { recursive: true });
  const passwordFile = path.join(os.tmpdir(), `bellfield-postgres-${randomUUID()}.txt`);
  writeFileSync(passwordFile, postgresPassword, 'utf8');

  try {
    run(executable('initdb'), ['-D', dataDir, '-U', 'postgres', `--pwfile=${passwordFile}`, '-A', 'scram-sha-256', '-E', 'UTF8']);
  } finally {
    if (existsSync(passwordFile)) {
      unlinkSync(passwordFile);
    }
  }
}

function startServer() {
  mkdirSync(logDir, { recursive: true });
  const status = run(executable('pg_ctl'), ['-D', dataDir, 'status'], { allowFailure: true, capture: true });

  if (status.status === 0) {
    console.log('Local PostgreSQL is already running.');
    return;
  }

  run(executable('pg_ctl'), ['-D', dataDir, '-l', path.join(logDir, 'postgres.log'), '-o', `-p ${postgresPort}`, 'start']);
}

function ensureDatabase() {
  const postgresUrl = `postgresql://postgres:${postgresPassword}@localhost:${postgresPort}/postgres`;
  const databaseUrl = `postgresql://postgres:${postgresPassword}@localhost:${postgresPort}/${postgresDatabase}`;
  const existing = run(
    executable('psql'),
    ['-d', postgresUrl, '-tAc', `select 1 from pg_database where datname = '${postgresDatabase.replace(/'/g, "''")}'`],
    { capture: true }
  );

  if ((existing.stdout || '').trim() !== '1') {
    run(executable('createdb'), ['-h', 'localhost', '-p', postgresPort, '-U', 'postgres', postgresDatabase]);
  }

  run(executable('pg_isready'), ['-h', 'localhost', '-p', postgresPort, '-U', 'postgres']);
  console.log(`Local PostgreSQL is ready: ${databaseUrl}`);
}

requirePostgresBinary();
initializeDataDirectory();
startServer();
ensureDatabase();
