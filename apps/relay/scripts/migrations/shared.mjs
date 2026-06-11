import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The relay is BellField-operated infrastructure, so unlike the API migration
// tooling there is no psql driver and no customer-machine path resolution.
const devDefaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield_relay';

function resolveMigrationsDir() {
  const candidates = [
    path.resolve(__dirname, '../../src/database/migrations'),
    path.resolve(__dirname, '../../database/migrations')
  ];

  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    path.resolve(__dirname, '../../src/database/migrations')
  );
}

export const migrationsDir = resolveMigrationsDir();

mkdirSync(migrationsDir, { recursive: true });

export function getRelayDatabaseUrl() {
  const configured = process.env.BELLFIELD_RELAY_DATABASE_URL;
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('Error: BELLFIELD_RELAY_DATABASE_URL is required in production.');
    process.exit(1);
  }

  return devDefaultDatabaseUrl;
}

export function listUpMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.up.sql'))
    .sort();
}

async function withClient(databaseUrl, run) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Dev convenience: create the relay database when it does not exist yet, so a
 * fresh checkout can run `migration:up` against the shared dev PostgreSQL
 * container without a manual createdb step.
 */
export async function ensureDatabaseExists(databaseUrl) {
  try {
    await withClient(databaseUrl, async () => undefined);
    return;
  } catch (error) {
    if (error?.code !== '3D000') {
      throw error;
    }
  }

  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!/^[a-z_][a-z0-9_]*$/.test(databaseName)) {
    console.error(`Error: refusing to auto-create database with unsafe name "${databaseName}".`);
    process.exit(1);
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  console.log(`Creating missing relay database "${databaseName}".`);
  await withClient(adminUrl.toString(), async (client) => {
    await client.query(`CREATE DATABASE ${databaseName};`);
  });
}

export async function ensureSchemaMigrationsTable(databaseUrl) {
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

export async function listAppliedMigrationFilenames(databaseUrl) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query('SELECT filename FROM schema_migrations ORDER BY id ASC;');
    return result.rows.map((row) => row.filename);
  });
}

export async function getLastAppliedMigrationFilename(databaseUrl) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1;'
    );
    return result.rows[0]?.filename ?? '';
  });
}

export async function applyMigrationFile(databaseUrl, filename, filePath) {
  const sql = readFileSync(filePath, 'utf8');

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

export async function rollbackMigrationFile(databaseUrl, filename, filePath) {
  const sql = readFileSync(filePath, 'utf8');

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
