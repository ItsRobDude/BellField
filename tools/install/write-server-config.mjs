import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArgs } from './install-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function randomSecret() {
  return randomBytes(32).toString('base64url');
}

const args = readArgs();
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const outputPath = resolve(String(args.output ?? join(installRoot, 'bellfield-server.env')));
const force = args.force === 'true';

if (existsSync(outputPath) && !force) {
  throw new Error(`${outputPath} already exists. Pass --force=true to overwrite it.`);
}

const templatePath = join(repoRoot, 'bellfield-server.env.example');
const template = readFileSync(templatePath, 'utf8');
const mediaRoot = join(installRoot, 'data', 'media');
const backupRoot = join(installRoot, 'data', 'backups');
const licensePath = join(installRoot, 'data', 'license', 'bellfield-license.json');
const databasePassword = randomSecret();
const mediaSecret = randomSecret();
// Identifies this physical server to the delivery relay (single-active
// binding). Deliberately not part of backup sets: a replacement machine gets
// a fresh id from rerunning this helper, and the relay rebinds automatically.
const serverInstanceId = randomUUID();

const config = template
  .replace('CHANGE_ME@127.0.0.1:5432', `${encodeURIComponent(databasePassword)}@127.0.0.1:5432`)
  .replace('C:\\BellField\\data\\media', mediaRoot)
  .replace('C:\\BellField\\data\\backups', backupRoot)
  .replace('CHANGE_ME_TO_AT_LEAST_32_RANDOM_CHARACTERS', mediaSecret)
  .replace('C:\\BellField\\data\\license\\bellfield-license.json', licensePath)
  .replace('GENERATED_SERVER_INSTANCE_ID', serverInstanceId);

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(mediaRoot, { recursive: true });
mkdirSync(backupRoot, { recursive: true });
mkdirSync(dirname(licensePath), { recursive: true });
writeFileSync(outputPath, config);

console.log(`Wrote ${outputPath}`);
console.log('Record the generated database password in the customer install notes.');
