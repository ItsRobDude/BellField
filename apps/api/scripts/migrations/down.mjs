import path from 'node:path';
import { existsSync } from 'node:fs';

import {
  ensureSchemaMigrationsTable,
  getLastAppliedMigrationFilename,
  getMigrationDriver,
  migrationsDir,
  requireDatabaseUrl,
  rollbackMigrationFile
} from './shared.mjs';

const databaseUrl = requireDatabaseUrl();
const driver = getMigrationDriver();

await ensureSchemaMigrationsTable(databaseUrl, driver);

const lastFilename = await getLastAppliedMigrationFilename(databaseUrl, driver);

if (!lastFilename) {
  console.log('No applied migrations found.');
  process.exit(0);
}

const downFilename = `${lastFilename.replace(/\.up\.sql$/, '')}.down.sql`;
const downFile = path.join(migrationsDir, downFilename);

if (!existsSync(downFile)) {
  console.error(`Error: rollback file not found for ${lastFilename}`);
  console.error(`Expected: ${downFile}`);
  process.exit(1);
}

console.log(`Reverting ${lastFilename} using ${downFilename} with ${driver} driver`);
await rollbackMigrationFile(databaseUrl, lastFilename, downFile, driver);

console.log(`Rolled back ${lastFilename}`);
