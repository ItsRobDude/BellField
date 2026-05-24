import { readdirSync, writeFileSync } from 'node:fs';
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

const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const existingSequences = readdirSync(migrationsDir)
  .map(
    (fileName) => fileName.match(new RegExp(`^${dateStamp}_(\\d{3})_.*\\.(?:up|down)\\.sql$`))?.[1]
  )
  .filter(Boolean)
  .map((sequence) => Number(sequence));
const nextSequence = String(
  (existingSequences.length > 0 ? Math.max(...existingSequences) : 0) + 1
).padStart(3, '0');
const base = `${dateStamp}_${nextSequence}_${safeName}`;
const upPath = path.join(migrationsDir, `${base}.up.sql`);
const downPath = path.join(migrationsDir, `${base}.down.sql`);

writeFileSync(upPath, `-- Migration: ${base}\n-- Write forward SQL here.\n`, 'utf8');

writeFileSync(downPath, `-- Migration: ${base}\n-- Write rollback SQL here.\n`, 'utf8');

console.log('Created:');
console.log(`  ${upPath}`);
console.log(`  ${downPath}`);
