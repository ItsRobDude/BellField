import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArgs } from './install-utils.mjs';
import { readBackupRecoveryMetadata } from './backup-recovery-metadata.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function randomSecret() {
  return randomBytes(32).toString('base64url');
}

const args = readArgs();
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const outputPath = resolve(String(args.output ?? join(installRoot, 'bellfield-server.env')));
const force = args.force === 'true';
const fromBackup = args['from-backup'] ? resolve(String(args['from-backup'])) : null;

if (fromBackup && Object.hasOwn(args, 'force')) {
  throw new Error(
    '--from-backup requires a fresh output file and cannot be combined with --force.'
  );
}

if (existsSync(outputPath) && !force) {
  throw new Error(
    fromBackup
      ? `${outputPath} already exists. Recovery configuration requires a fresh output file.`
      : `${outputPath} already exists. Pass --force=true to overwrite it.`
  );
}

// Validate the complete imported envelope before creating any output or storage directories.
const recovery = fromBackup ? readBackupRecoveryMetadata(fromBackup) : null;
if (fromBackup && !recovery) {
  throw new Error(
    'This legacy backup has no recovery configuration. Generate a fresh server config without --from-backup and reconstruct its nonsecret settings from the install/restore runbooks.'
  );
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
// a fresh id from rerunning this helper. Replacement-server relay access is
// deliberately recovered or reissued separately rather than inherited from backup metadata.
const serverInstanceId = randomUUID();

let config = template
  .replace('CHANGE_ME@127.0.0.1:5432', `${encodeURIComponent(databasePassword)}@127.0.0.1:5432`)
  .replace('C:\\BellField\\data\\media', () => mediaRoot)
  .replace('C:\\BellField\\data\\backups', () => backupRoot)
  .replace('CHANGE_ME_TO_AT_LEAST_32_RANDOM_CHARACTERS', mediaSecret)
  .replace('C:\\BellField\\data\\license\\bellfield-license.json', () => licensePath)
  .replace('GENERATED_SERVER_INSTANCE_ID', serverInstanceId);

if (recovery) {
  config = applySettings(config, {
    ...recovery.configuration.settings,
    // A saved public URL describes the old connection; it must not enable a new server.
    BELLFIELD_RELAY_BASE_URL: '',
    BELLFIELD_RELAY_TOKEN: ''
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(mediaRoot, { recursive: true });
mkdirSync(backupRoot, { recursive: true });
mkdirSync(dirname(licensePath), { recursive: true });
writeFileSync(outputPath, config, { flag: force ? 'w' : 'wx' });

console.log(`Wrote ${outputPath}`);
console.log('Generated database credentials were written only to the restricted server env file.');
if (recovery) {
  console.log(`Recovered nonsecret configuration status: ${recovery.configuration.status}.`);
  if (recovery.configuration.status === 'partial') {
    console.log(
      'Some settings were not captured; review template defaults before starting services.'
    );
  }
  console.log(
    'Generated fresh database/media credentials, server identity, and install-root storage paths.'
  );
  console.log(
    'Review recovered LAN addresses; use the LAN configuration helper if this machine has changed.'
  );
  console.log(
    recovery.configuration.relayConfigured
      ? 'The prior server had relay access. Relay is disabled here; recover or reissue its credentials separately before enabling it.'
      : 'Relay remains disabled. Configure it separately if needed.'
  );
}

function applySettings(config, settings) {
  const remaining = new Map(Object.entries(settings));
  const updated = config.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, name) => {
    if (!Object.hasOwn(settings, name)) return line;
    remaining.delete(name);
    return `${name}=${settings[name]}`;
  });
  if (remaining.size === 0) return updated;
  return `${updated.trimEnd()}\n\n# Recovered nonsecret settings\n${[...remaining]
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
}
