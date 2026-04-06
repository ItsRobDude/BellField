import path from 'node:path';

import {
  listUpMigrationFiles,
  migrationsDir,
  queryPsql,
  requireDatabaseUrl,
  runPsql
} from './shared.mjs';

const databaseUrl = requireDatabaseUrl();

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

const upFiles = listUpMigrationFiles();

for (const filename of upFiles) {
  const escapedFilename = filename.replace(/'/g, "''");
  const alreadyApplied = queryPsql(
    `SELECT 1 FROM schema_migrations WHERE filename = '${escapedFilename}' LIMIT 1;`,
    { databaseUrl }
  );

  if (alreadyApplied === '1') {
    continue;
  }

  const filePath = path.join(migrationsDir, filename);
  console.log(`Applying ${filename}`);
  runPsql(['-f', filePath], { databaseUrl });
  runPsql(['-c', `INSERT INTO schema_migrations (filename) VALUES ('${escapedFilename}');`], {
    databaseUrl
  });
}

console.log('Migrations are up to date.');
