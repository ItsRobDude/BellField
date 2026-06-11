import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeSignedReleaseArtifact } from '../update/release-artifact.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'bellfield-updater-smoke-'));
const defaultLicensePrivateKeyPath =
  'C:\\Users\\rober\\Documents\\API Keys\\BellField\\license-v1\\bellfield-license-private-key.pem';
const defaultReleasePrivateKeyPath =
  'C:\\Users\\rober\\Documents\\API Keys\\BellField\\release-v1\\bellfield-release-private-key.pem';
const licensePrivateKeyPath = getArgValue('--license-private-key') || defaultLicensePrivateKeyPath;
const releasePrivateKeyPath = getArgValue('--release-private-key') || defaultReleasePrivateKeyPath;
const installRoot = path.join(root, 'BellField');
const currentReleaseRoot = path.join(installRoot, 'release');
const updateArtifactRoot = path.join(root, 'update-artifact');
const envPath = path.join(installRoot, 'bellfield-server.env');
const licensePath = path.join(installRoot, 'data', 'license', 'bellfield-license.json');
const evidence = {
  name: 'Updater smoke',
  startedAt: new Date().toISOString(),
  checks: []
};

try {
  check('license private key exists outside repo', existsSync(licensePrivateKeyPath), {
    licensePrivateKeyPath
  });
  check('release private key exists outside repo', existsSync(releasePrivateKeyPath), {
    releasePrivateKeyPath
  });

  writeCurrentRelease();
  writeUpdateArtifact();
  issueSmokeLicense();
  writeServerEnv();

  const updateResult = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'install', 'update-bellfield.mjs'),
      `--install-root=${installRoot}`,
      `--current-release-root=${currentReleaseRoot}`,
      `--update-artifact-root=${updateArtifactRoot}`,
      `--env=${envPath}`,
      '--confirm=UPDATE',
      '--skip-services=true',
      '--skip-health=true',
      '--skip-backup=true'
    ],
    { encoding: 'utf8', shell: false }
  );
  if (updateResult.status !== 0) {
    throw new Error(
      updateResult.stderr || updateResult.stdout || `updater exited ${updateResult.status}`
    );
  }

  const installedManifest = JSON.parse(
    readFileSync(path.join(currentReleaseRoot, 'bellfield-build-manifest.json'), 'utf8')
  );
  check(
    'current release root was replaced by update artifact',
    installedManifest.version === '1.2.4',
    {
      version: installedManifest.version
    }
  );
  check(
    'packaged migrations ran during update',
    updateResult.stdout.includes('scratch migrations applied')
  );

  const rollbackDirectory = readdirSync(installRoot).find((entry) =>
    entry.startsWith('release.restore-rollback-')
  );
  check('previous release was preserved as rollback directory', Boolean(rollbackDirectory), {
    rollbackDirectory
  });
  check(
    'rollback directory contains previous release marker',
    Boolean(
      rollbackDirectory &&
        existsSync(path.join(installRoot, rollbackDirectory, 'old-release-marker.txt'))
    )
  );

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

function writeCurrentRelease() {
  mkdirSync(currentReleaseRoot, { recursive: true });
  writeFileSync(path.join(currentReleaseRoot, 'old-release-marker.txt'), 'old release', {
    flag: 'wx'
  });
}

function writeUpdateArtifact() {
  mkdirSync(path.join(updateArtifactRoot, 'runtime', 'node'), { recursive: true });
  mkdirSync(path.join(updateArtifactRoot, 'apps', 'api', 'scripts', 'migrations'), {
    recursive: true
  });
  copyFileSync(
    process.execPath,
    path.join(
      updateArtifactRoot,
      'runtime',
      'node',
      process.platform === 'win32' ? 'node.exe' : 'node'
    )
  );
  writeFileSync(
    path.join(updateArtifactRoot, 'bellfield-build-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        buildKind: 'release',
        licenseRequired: true,
        version: '1.2.4',
        releaseDate: '2026-06-11',
        generatedAt: '2026-06-11T00:00:00.000Z',
        sourceCommit: 'def5678'
      },
      null,
      2
    )}\n`,
    { flag: 'wx' }
  );
  writeFileSync(
    path.join(updateArtifactRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs'),
    "console.log('scratch migrations applied');\n",
    { flag: 'wx' }
  );
  writeSignedReleaseArtifact({
    releaseRoot: updateArtifactRoot,
    privateKeyPath: releasePrivateKeyPath,
    now: new Date('2026-06-11T00:00:00.000Z')
  });
}

function issueSmokeLicense() {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'license', 'issue-license.mjs'),
      `--private-key=${licensePrivateKeyPath}`,
      '--license-id=lic_updater_smoke',
      '--shop-name=BellField Updater Smoke',
      '--update-window-end=2026-06-11',
      `--output=${licensePath}`,
      `--ledger=${path.join(root, 'issued-licenses.jsonl')}`
    ],
    { encoding: 'utf8', shell: false }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `issue-license exited ${result.status}`);
  }
}

function writeServerEnv() {
  const username = 'bellfield';
  const password = ['updater', 'smoke', 'password'].join('-');
  mkdirSync(path.dirname(envPath), { recursive: true });
  writeFileSync(
    envPath,
    [
      'NODE_ENV=production',
      `DATABASE_URL=postgresql://${username}:${password}@127.0.0.1:5432/bellfield`,
      'BELLFIELD_API_PORT=3001',
      'BELLFIELD_OFFICE_ORIGINS=http://127.0.0.1:3000',
      `BELLFIELD_MEDIA_ROOT=${path.join(installRoot, 'data', 'media')}`,
      `BELLFIELD_BACKUP_ROOT=${path.join(installRoot, 'data', 'backups')}`,
      'BELLFIELD_LICENSE_REQUIRED=true',
      `BELLFIELD_LICENSE_PATH=${licensePath}`
    ].join('\n'),
    { flag: 'wx' }
  );
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
