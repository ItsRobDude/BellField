import path from 'node:path';
import { existsSync } from 'node:fs';

import {
  getLastAppliedMigrationFilename,
  getRelayDatabaseUrl,
  migrationsDir,
  rollbackMigrationFile
} from './shared.mjs';

const databaseUrl = getRelayDatabaseUrl();
const lastApplied = await getLastAppliedMigrationFilename(databaseUrl);

if (!lastApplied) {
  console.log('No applied migrations to roll back.');
  process.exit(0);
}

const downFilename = lastApplied.replace(/\.up\.sql$/, '.down.sql');
const downPath = path.join(migrationsDir, downFilename);

if (!existsSync(downPath)) {
  console.error(`Error: down migration is missing: ${downFilename}`);
  process.exit(1);
}

console.log(`Rolling back ${lastApplied}`);
await rollbackMigrationFile(databaseUrl, lastApplied, downPath);
console.log('Rollback complete.');
