import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { migrationsDir } from './shared.mjs';

const rawName = process.argv.slice(2).join(' ').trim();

if (!rawName) {
  console.error('Usage: pnpm --filter @bellfield/api migration:create -- <migration_name>');
  process.exit(1);
}

const safeName = rawName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

if (!safeName) {
  console.error('Error: migration name must include letters or numbers.');
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const base = `${stamp}_${safeName}`;
const upPath = path.join(migrationsDir, `${base}.up.sql`);
const downPath = path.join(migrationsDir, `${base}.down.sql`);

writeFileSync(upPath, `-- Migration: ${base}\n-- Write forward SQL here.\n`, 'utf8');

writeFileSync(downPath, `-- Migration: ${base}\n-- Write rollback SQL here.\n`, 'utf8');

console.log('Created:');
console.log(`  ${upPath}`);
console.log(`  ${downPath}`);
