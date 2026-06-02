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

let appliedCount = 0;
for (const filename of upFiles) {
  if (alreadyApplied.has(filename)) {
    continue;
  }

  const filePath = path.join(migrationsDir, filename);
  console.log(`Applying ${filename} using ${driver} driver`);
  await applyMigrationFile(databaseUrl, filename, filePath, driver);
  appliedCount += 1;
}

// Make the final line unambiguous about what actually happened, so the outcome
// is clear even when the log is truncated to its last line: distinguish
// "nothing to do" from "applied N this run".
if (appliedCount === 0) {
  console.log(`Migrations are up to date. (${alreadyApplied.size} already applied, none pending.)`);
} else {
  const plural = appliedCount === 1 ? 'migration' : 'migrations';
  console.log(`Applied ${appliedCount} ${plural}. Migrations are now up to date.`);
}
