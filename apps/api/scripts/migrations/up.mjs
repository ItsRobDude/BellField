import path from 'node:path';

import {
  applyMigrationFile,
  ensureSchemaMigrationsTable,
  getMigrationDriver,
  listAppliedMigrationFilenames,
  listUpMigrationFiles,
  migrationsDir,
  requireDatabaseUrl
} from './shared.mjs';

const databaseUrl = requireDatabaseUrl();
const driver = getMigrationDriver();

await ensureSchemaMigrationsTable(databaseUrl, driver);

const alreadyApplied = new Set(await listAppliedMigrationFilenames(databaseUrl, driver));
const upFiles = listUpMigrationFiles();

for (const filename of upFiles) {
  if (alreadyApplied.has(filename)) {
    continue;
  }

  const filePath = path.join(migrationsDir, filename);
  console.log(`Applying ${filename} using ${driver} driver`);
  await applyMigrationFile(databaseUrl, filename, filePath, driver);
}

console.log('Migrations are up to date.');
