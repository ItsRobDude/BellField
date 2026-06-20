import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pgModulePromise;

function resolveMigrationsDir() {
  const candidates = [
    path.resolve(__dirname, '../../src/database/migrations'),
    path.resolve(__dirname, '../../database/migrations'),
    path.resolve(process.cwd(), 'apps/api/src/database/migrations'),
    path.resolve(process.cwd(), 'src/database/migrations'),
    path.resolve(process.cwd(), 'database/migrations')
  ];

  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    path.resolve(__dirname, '../../src/database/migrations')
  );
}

export const migrationsDir = resolveMigrationsDir();

mkdirSync(migrationsDir, { recursive: true });

export function requireDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is required.');
    process.exit(1);
  }

  return databaseUrl;
}

export function getMigrationDriver() {
  const driverArgument = process.argv.find((argument) => argument.startsWith('--driver='));
  const requestedDriver =
    driverArgument?.split('=')[1] ?? process.env.BELLFIELD_MIGRATION_DRIVER ?? 'node';

  if (requestedDriver !== 'node' && requestedDriver !== 'psql') {
    console.error(
      `Error: unsupported migration driver "${requestedDriver}". Use "node" or "psql".`
    );
    process.exit(1);
  }

  return requestedDriver;
}

export function listUpMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.up.sql'))
    .sort();
}

function readSqlFile(filePath) {
  return readFileSync(filePath, 'utf8');
}

async function withClient(databaseUrl, run) {
  const { Client } = await loadPg();
  const client = new Client({ connectionString: requireDatabaseUrl(databaseUrl) });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function ensureSchemaMigrationsTableNode(databaseUrl) {
  await withClient(databaseUrl, async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });
}

async function listAppliedMigrationFilenamesNode(databaseUrl) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query('SELECT filename FROM schema_migrations ORDER BY id ASC;');
    return result.rows.map((row) => row.filename);
  });
}

async function getLastAppliedMigrationFilenameNode(databaseUrl) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1;'
    );
    return result.rows[0]?.filename ?? '';
  });
}

async function applyMigrationFileNode(databaseUrl, filename, filePath) {
  const sql = readSqlFile(filePath);

  await withClient(databaseUrl, async (client) => {
    await client.query('BEGIN');

    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function rollbackMigrationFileNode(databaseUrl, filename, filePath) {
  const sql = readSqlFile(filePath);

  await withClient(databaseUrl, async (client) => {
    await client.query('BEGIN');

    try {
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE filename = $1;', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

function ensureSchemaMigrationsTablePsql(databaseUrl) {
  runPsql(
    [
      '-c',
      `CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
    ],
    { databaseUrl }
  );
}

function listAppliedMigrationFilenamesPsql(databaseUrl) {
  const result = queryPsql('SELECT filename FROM schema_migrations ORDER BY id ASC;', {
    databaseUrl,
    allowFailure: true
  });

  return result
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getLastAppliedMigrationFilenamePsql(databaseUrl) {
  return queryPsql('SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1;', {
    databaseUrl,
    allowFailure: true
  });
}

function applyMigrationFilePsql(databaseUrl, filename, filePath) {
  const escapedFilename = filename.replace(/'/g, "''");
  runPsql(['-f', filePath], { databaseUrl });
  runPsql(['-c', `INSERT INTO schema_migrations (filename) VALUES ('${escapedFilename}');`], {
    databaseUrl
  });
}

function rollbackMigrationFilePsql(databaseUrl, filename, filePath) {
  const escapedFilename = filename.replace(/'/g, "''");
  runPsql(['-f', filePath], { databaseUrl });
  runPsql(['-c', `DELETE FROM schema_migrations WHERE filename = '${escapedFilename}';`], {
    databaseUrl
  });
}

export async function ensureSchemaMigrationsTable(databaseUrl, driver = getMigrationDriver()) {
  if (driver === 'psql') {
    ensureSchemaMigrationsTablePsql(databaseUrl);
    return;
  }

  await ensureSchemaMigrationsTableNode(databaseUrl);
}

export async function listAppliedMigrationFilenames(databaseUrl, driver = getMigrationDriver()) {
  if (driver === 'psql') {
    return listAppliedMigrationFilenamesPsql(databaseUrl);
  }

  return listAppliedMigrationFilenamesNode(databaseUrl);
}

export async function getLastAppliedMigrationFilename(databaseUrl, driver = getMigrationDriver()) {
  if (driver === 'psql') {
    return getLastAppliedMigrationFilenamePsql(databaseUrl);
  }

  return getLastAppliedMigrationFilenameNode(databaseUrl);
}

export async function applyMigrationFile(
  databaseUrl,
  filename,
  filePath,
  driver = getMigrationDriver()
) {
  if (driver === 'psql') {
    applyMigrationFilePsql(databaseUrl, filename, filePath);
    return;
  }

  await applyMigrationFileNode(databaseUrl, filename, filePath);
}

export async function rollbackMigrationFile(
  databaseUrl,
  filename,
  filePath,
  driver = getMigrationDriver()
) {
  if (driver === 'psql') {
    rollbackMigrationFilePsql(databaseUrl, filename, filePath);
    return;
  }

  await rollbackMigrationFileNode(databaseUrl, filename, filePath);
}

export function runPsql(
  args,
  { databaseUrl = process.env.DATABASE_URL, allowFailure = false } = {}
) {
  const psql = resolvePsqlExecutable();
  const result = spawnSync(psql, [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32' && psql === 'psql'
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
  const psql = resolvePsqlExecutable();
  const result = spawnSync(psql, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32' && psql === 'psql'
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

async function loadPg() {
  pgModulePromise ??= import('pg');
  const pg = await pgModulePromise;
  const Client = pg.default?.Client ?? pg.Client;
  if (!Client) {
    throw new Error('The pg package did not expose a Client constructor.');
  }
  return { Client };
}

function resolvePsqlExecutable() {
  const explicit = getArgValue('--psql-path') ?? process.env.BELLFIELD_PSQL_PATH;
  if (explicit) {
    return path.resolve(explicit);
  }

  const binaryName = process.platform === 'win32' ? 'psql.exe' : 'psql';
  const candidates = [
    path.resolve(__dirname, '../../../../postgres/bin', binaryName),
    path.resolve(process.cwd(), 'release/postgres/bin', binaryName),
    path.resolve(process.cwd(), 'postgres/bin', binaryName)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'psql';
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}
