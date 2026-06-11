import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const timestamp = new Date().toISOString();
const root = mkdtempSync(path.join(tmpdir(), 'bellfield-service-manifest-smoke-'));
const releaseRoot = path.join(root, 'release');
const installRoot = path.join(root, 'install');
const envPath = path.join(installRoot, 'bellfield-server.env');
const outputDir = path.join(releaseRoot, 'services');
const renderScript = path.resolve('tools', 'install', 'render-windows-services.mjs');
const evidence = {
  name: 'Windows service manifest smoke',
  startedAt: timestamp,
  checks: []
};

try {
  mkdirSync(path.join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web'), {
    recursive: true
  });
  mkdirSync(installRoot, { recursive: true });
  writeFileSync(
    path.join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js'),
    ''
  );
  writeFileSync(
    envPath,
    [
      'NODE_ENV=production',
      'DATABASE_URL=postgresql://bellfield:CHANGE_ME@127.0.0.1:5432/bellfield',
      'BELLFIELD_API_PORT=3001',
      'BELLFIELD_OFFICE_WEB_PORT=3000',
      'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001',
      'BELLFIELD_OFFICE_ORIGINS=http://localhost:3000',
      'BELLFIELD_MEDIA_ROOT=C:\\BellField\\data\\media',
      'BELLFIELD_MEDIA_TOKEN_SECRET=media-secret',
      'BELLFIELD_LICENSE_REQUIRED=true',
      'BELLFIELD_LICENSE_PATH=C:\\BellField\\data\\license\\bellfield-license.json',
      'BELLFIELD_BACKUP_ENABLED=true',
      'BELLFIELD_BACKUP_ROOT=C:\\BellField\\data\\backups',
      'BELLFIELD_BACKUP_INTERVAL_MINUTES=1440',
      'BELLFIELD_BACKUP_RETENTION_COUNT=7',
      'BELLFIELD_BACKUP_STALE_AFTER_HOURS=36',
      'BELLFIELD_RELAY_BASE_URL=https://relay.bellfield.app',
      'BELLFIELD_RELAY_TOKEN=CHANGE_ME',
      'BELLFIELD_RELAY_SERVER_INSTANCE_ID=00000000-0000-4000-8000-000000000000'
    ].join('\n')
  );

  const result = spawnSync(
    process.execPath,
    [
      renderScript,
      `--release-root=${releaseRoot}`,
      `--install-root=${installRoot}`,
      `--env=${envPath}`,
      `--output=${outputDir}`
    ],
    { encoding: 'utf8', shell: false }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `render exited ${result.status}`);
  }

  const postgresXml = readManifest('bellfield-postgres');
  const apiXml = readManifest('bellfield-api');
  const workerXml = readManifest('bellfield-worker');
  const officeXml = readManifest('bellfield-office-web');

  for (const [serviceId, xml] of Object.entries({
    postgresXml,
    apiXml,
    workerXml,
    officeXml
  })) {
    check(
      `${serviceId} uses 10MB WinSW log threshold`,
      xml.includes('<sizeThreshold>10240</sizeThreshold>')
    );
  }

  check('api keeps database URL', apiXml.includes('DATABASE_URL'));
  check('api keeps media token secret', apiXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET'));
  check('worker keeps database URL', workerXml.includes('DATABASE_URL'));
  check(
    'worker does not receive media token secret',
    !workerXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('postgres does not receive database URL', !postgresXml.includes('DATABASE_URL'));
  check(
    'postgres does not receive media token secret',
    !postgresXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('office does not receive database URL', !officeXml.includes('DATABASE_URL'));
  check(
    'office does not receive media token secret',
    !officeXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('office keeps public API URL', officeXml.includes('NEXT_PUBLIC_API_BASE_URL'));
  check('api keeps relay token', apiXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('worker keeps relay token', workerXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('postgres does not receive relay token', !postgresXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('office does not receive relay token', !officeXml.includes('BELLFIELD_RELAY_TOKEN'));

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function readManifest(serviceId) {
  const pathName = path.join(outputDir, `${serviceId}.xml`);
  if (!existsSync(pathName)) {
    throw new Error(`Missing service manifest: ${serviceId}`);
  }
  return readFileSync(pathName, 'utf8');
}

function check(name, passed) {
  evidence.checks.push({ name, passed });
  if (!passed) {
    throw new Error(name);
  }
}
