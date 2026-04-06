import path from 'node:path';
import { existsSync } from 'node:fs';

import { migrationsDir, queryPsql, requireDatabaseUrl, runPsql } from './shared.mjs';

const databaseUrl = requireDatabaseUrl();

const lastFilename = queryPsql('SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1;', {
  databaseUrl,
  allowFailure: true
});

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

const escapedFilename = lastFilename.replace(/'/g, "''");
console.log(`Reverting ${lastFilename} using ${downFilename}`);
runPsql(['-f', downFile], { databaseUrl });
runPsql(['-c', `DELETE FROM schema_migrations WHERE filename = '${escapedFilename}';`], {
  databaseUrl
});

console.log(`Rolled back ${lastFilename}`);
