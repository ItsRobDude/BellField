import path from 'node:path';

import {
  applyMigrationFile,
  ensureDatabaseExists,
  ensureSchemaMigrationsTable,
  getRelayDatabaseUrl,
  listAppliedMigrationFilenames,
  listUpMigrationFiles,
  migrationsDir
} from './shared.mjs';

const databaseUrl = getRelayDatabaseUrl();

await ensureDatabaseExists(databaseUrl);
await ensureSchemaMigrationsTable(databaseUrl);

const alreadyApplied = new Set(await listAppliedMigrationFilenames(databaseUrl));
const upFiles = listUpMigrationFiles();

let appliedCount = 0;
for (const filename of upFiles) {
  if (alreadyApplied.has(filename)) {
    continue;
  }

  const filePath = path.join(migrationsDir, filename);
  console.log(`Applying ${filename}`);
  await applyMigrationFile(databaseUrl, filename, filePath);
  appliedCount += 1;
}

if (appliedCount === 0) {
  console.log(`Migrations are up to date. (${alreadyApplied.size} already applied, none pending.)`);
} else {
  const plural = appliedCount === 1 ? 'migration' : 'migrations';
  console.log(`Applied ${appliedCount} ${plural}. Migrations are now up to date.`);
}
