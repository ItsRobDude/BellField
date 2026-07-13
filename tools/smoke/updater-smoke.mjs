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
import { writeSmokeEvidence } from './smoke-evidence.mjs';

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
  issueSmokeLicense({
    licenseId: 'lic_updater_smoke',
    shopName: 'BellField Updater Smoke',
    updateWindowEnd: '2026-06-11',
    outputPath: licensePath
  });
  writeServerEnv({ envPath, licensePath });

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
  const serviceIds = [
    'bellfield-postgres',
    'bellfield-api',
    'bellfield-worker',
    'bellfield-office-web'
  ];
  const missingServiceAssets = serviceIds.flatMap((serviceId) =>
    ['exe', 'xml']
      .map((extension) => path.join(currentReleaseRoot, 'services', `${serviceId}.${extension}`))
      .filter((assetPath) => !existsSync(assetPath))
  );
  check(
    'updater prepares service wrappers and manifests in the staged release',
    missingServiceAssets.length === 0,
    { missingServiceAssets }
  );
  const postgresXmlPath = path.join(currentReleaseRoot, 'services', 'bellfield-postgres.xml');
  const postgresXml = readFileSync(postgresXmlPath, 'utf8');
  check(
    'rendered service XML targets the stable installed release root',
    postgresXml.includes(
      escapeXmlForSmoke(path.join(currentReleaseRoot, 'postgres', 'bin', 'postgres.exe'))
    ) && !postgresXml.includes(escapeXmlForSmoke(updateArtifactRoot)),
    {
      postgresXmlPath,
      currentReleaseRoot,
      updateArtifactRoot
    }
  );
  check(
    'updater emitted structured phase and result evidence',
    updateResult.stdout.includes('BELLFIELD_UPDATE_PHASE ') &&
      updateResult.stdout.includes('BELLFIELD_UPDATE_RESULT ')
  );
  const updateLogRoot = path.join(installRoot, 'data', 'logs', 'update');
  const updateLogPath = latestUpdateLogPath(updateLogRoot);
  const updateLogRecords = updateLogPath ? readJsonLines(updateLogPath) : [];
  evidence.updateLogPath = updateLogPath;
  check('updater created durable update JSONL evidence', Boolean(updateLogPath), {
    updateLogPath
  });
  check(
    'durable update evidence contains phase and terminal result records',
    updateLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_PHASE') &&
      updateLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_RESULT'),
    {
      events: updateLogRecords.map((record) => record.event)
    }
  );

  const rejectedResult = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'install', 'update-bellfield.mjs'),
      `--install-root=${installRoot}`,
      `--current-release-root=${currentReleaseRoot}`,
      `--update-artifact-root=${currentReleaseRoot}`,
      '--confirm=UPDATE',
      '--skip-services=true',
      '--skip-health=true',
      '--skip-backup=true'
    ],
    { encoding: 'utf8', shell: false }
  );
  check('invalid updater invocation exits nonzero', rejectedResult.status !== 0, {
    status: rejectedResult.status
  });
  const rejectedLogPath = latestUpdateLogPath(updateLogRoot);
  const rejectedLogRecords = rejectedLogPath ? readJsonLines(rejectedLogPath) : [];
  evidence.rejectedUpdateLogPath = rejectedLogPath;
  check(
    'invalid updater invocation records rejected instead of fatal',
    rejectedLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_REJECTED') &&
      !rejectedLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_FATAL'),
    {
      events: rejectedLogRecords.map((record) => record.event),
      stdout: rejectedResult.stdout,
      stderr: rejectedResult.stderr
    }
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

  // Gate 4 regression guard: a real signed artifact plus a real signed license
  // whose update window ends before the artifact release date must be refused
  // pre-flight — a REJECTED terminal event with the expired reason, zero update
  // phases, and no on-disk side effects. Dates are relative to the artifact
  // (releaseDate 2026-06-11), not the wall clock, so this stays deterministic.
  const expiredLicensePath = path.join(
    installRoot,
    'data',
    'license',
    'bellfield-license-expired-smoke.json'
  );
  const expiredEnvPath = path.join(installRoot, 'bellfield-server-expired.env');
  issueSmokeLicense({
    licenseId: 'lic_updater_smoke_expired',
    shopName: 'BellField Updater Smoke Expired',
    updateWindowEnd: '2026-06-10',
    outputPath: expiredLicensePath
  });
  writeServerEnv({ envPath: expiredEnvPath, licensePath: expiredLicensePath });

  const preExpiredInstallEntries = JSON.stringify(readdirSync(installRoot).sort());
  const preExpiredManifestVersion = JSON.parse(
    readFileSync(path.join(currentReleaseRoot, 'bellfield-build-manifest.json'), 'utf8')
  ).version;
  const preExpiredLogFiles = new Set(listUpdateLogFiles(updateLogRoot));

  const expiredResult = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'install', 'update-bellfield.mjs'),
      `--install-root=${installRoot}`,
      `--current-release-root=${currentReleaseRoot}`,
      `--update-artifact-root=${updateArtifactRoot}`,
      `--env=${expiredEnvPath}`,
      '--confirm=UPDATE',
      '--skip-services=true',
      '--skip-health=true',
      '--skip-backup=true'
    ],
    { encoding: 'utf8', shell: false }
  );
  check('expired-window update exits nonzero', expiredResult.status !== 0, {
    status: expiredResult.status,
    stdout: expiredResult.stdout,
    stderr: expiredResult.stderr
  });
  const newExpiredLogFiles = listUpdateLogFiles(updateLogRoot).filter(
    (logFile) => !preExpiredLogFiles.has(logFile)
  );
  check(
    'expired-window update wrote exactly one new durable update log',
    newExpiredLogFiles.length === 1,
    {
      newExpiredLogFiles
    }
  );
  const expiredLogPath = path.join(updateLogRoot, newExpiredLogFiles[0] ?? '');
  const expiredLogRecords = newExpiredLogFiles.length === 1 ? readJsonLines(expiredLogPath) : [];
  evidence.expiredUpdateLogPath = expiredLogPath;
  const expiredRejectedEvent = expiredLogRecords.find(
    (record) => record.event === 'BELLFIELD_UPDATE_REJECTED'
  );
  check(
    'expired-window update records a rejected terminal event with the expired reason',
    expiredRejectedEvent?.reason === 'update-window-expired' &&
      expiredRejectedEvent?.releaseDate === '2026-06-11' &&
      expiredRejectedEvent?.updateWindowEnd === '2026-06-10',
    {
      events: expiredLogRecords.map((record) => record.event),
      expiredRejectedEvent
    }
  );
  check(
    'expired-window rejection happens before any update phase or failure',
    !expiredLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_PHASE') &&
      !expiredLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_FAILURE') &&
      !expiredLogRecords.some((record) => record.event === 'BELLFIELD_UPDATE_FATAL'),
    {
      events: expiredLogRecords.map((record) => record.event)
    }
  );
  check(
    'expired-window refusal message tells the shop to renew update coverage',
    `${expiredResult.stdout}\n${expiredResult.stderr}`.includes(
      'this release is newer than the license update window'
    ),
    {
      stdout: expiredResult.stdout,
      stderr: expiredResult.stderr
    }
  );
  check(
    'expired-window refusal leaves the install root untouched',
    JSON.stringify(readdirSync(installRoot).sort()) === preExpiredInstallEntries,
    {
      preExpiredInstallEntries,
      installEntries: readdirSync(installRoot).sort()
    }
  );
  check(
    'expired-window refusal leaves the installed release version unchanged',
    JSON.parse(readFileSync(path.join(currentReleaseRoot, 'bellfield-build-manifest.json'), 'utf8'))
      .version === preExpiredManifestVersion,
    { preExpiredManifestVersion }
  );

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'updater-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'updater-smoke.json')}`);
  throw error;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function writeCurrentRelease() {
  mkdirSync(currentReleaseRoot, { recursive: true });
  mkdirSync(path.join(currentReleaseRoot, 'apps', 'office-web'), { recursive: true });
  mkdirSync(path.join(currentReleaseRoot, 'runtime', 'node'), { recursive: true });
  mkdirSync(path.join(currentReleaseRoot, 'postgres', 'bin'), { recursive: true });
  writeFileSync(path.join(currentReleaseRoot, 'old-release-marker.txt'), 'old release', {
    flag: 'wx'
  });
  writeFileSync(
    path.join(currentReleaseRoot, 'apps', 'office-web', 'server.js'),
    'old office server',
    {
      flag: 'wx'
    }
  );
}

function writeUpdateArtifact() {
  mkdirSync(path.join(updateArtifactRoot, 'runtime', 'node'), { recursive: true });
  mkdirSync(path.join(updateArtifactRoot, 'apps', 'api', 'scripts', 'migrations'), {
    recursive: true
  });
  mkdirSync(path.join(updateArtifactRoot, 'apps', 'office-web'), { recursive: true });
  mkdirSync(path.join(updateArtifactRoot, 'tools', 'install'), { recursive: true });
  mkdirSync(path.join(updateArtifactRoot, 'tools', 'winsw'), { recursive: true });
  mkdirSync(path.join(updateArtifactRoot, 'postgres', 'bin'), { recursive: true });
  copyFileSync(
    process.execPath,
    path.join(
      updateArtifactRoot,
      'runtime',
      'node',
      process.platform === 'win32' ? 'node.exe' : 'node'
    )
  );
  copyFileSync(
    path.resolve('tools', 'install', 'render-windows-services.mjs'),
    path.join(updateArtifactRoot, 'tools', 'install', 'render-windows-services.mjs')
  );
  copyFileSync(
    path.resolve('tools', 'install', 'install-utils.mjs'),
    path.join(updateArtifactRoot, 'tools', 'install', 'install-utils.mjs')
  );
  writeFileSync(
    path.join(updateArtifactRoot, 'tools', 'winsw', 'WinSW-x64.exe'),
    'scratch winsw binary',
    { flag: 'wx' }
  );
  writeFileSync(
    path.join(updateArtifactRoot, 'apps', 'office-web', 'server.js'),
    'scratch office server',
    { flag: 'wx' }
  );
  writeFileSync(
    path.join(updateArtifactRoot, 'postgres', 'bin', 'postgres.exe'),
    'scratch postgres binary',
    { flag: 'wx' }
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

function issueSmokeLicense({ licenseId, shopName, updateWindowEnd, outputPath }) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'license', 'issue-license.mjs'),
      `--private-key=${licensePrivateKeyPath}`,
      `--license-id=${licenseId}`,
      `--shop-name=${shopName}`,
      `--update-window-end=${updateWindowEnd}`,
      `--output=${outputPath}`,
      `--ledger=${path.join(root, 'issued-licenses.jsonl')}`
    ],
    { encoding: 'utf8', shell: false }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `issue-license exited ${result.status}`);
  }
}

function writeServerEnv({ envPath: targetEnvPath, licensePath: targetLicensePath }) {
  const username = 'bellfield';
  const password = ['updater', 'smoke', 'password'].join('-');
  mkdirSync(path.dirname(targetEnvPath), { recursive: true });
  writeFileSync(
    targetEnvPath,
    [
      'NODE_ENV=production',
      `DATABASE_URL=postgresql://${username}:${password}@127.0.0.1:5432/bellfield`,
      'BELLFIELD_API_PORT=3001',
      'BELLFIELD_OFFICE_ORIGINS=http://127.0.0.1:3000',
      `BELLFIELD_MEDIA_ROOT=${path.join(installRoot, 'data', 'media')}`,
      `BELLFIELD_BACKUP_ROOT=${path.join(installRoot, 'data', 'backups')}`,
      'BELLFIELD_LICENSE_REQUIRED=true',
      `BELLFIELD_LICENSE_PATH=${targetLicensePath}`
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

function escapeXmlForSmoke(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function readJsonLines(filePath) {
  return readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function latestUpdateLogPath(updateLogRoot) {
  const updateLogFiles = listUpdateLogFiles(updateLogRoot);
  return updateLogFiles.length ? path.join(updateLogRoot, updateLogFiles.at(-1)) : null;
}

function listUpdateLogFiles(updateLogRoot) {
  return existsSync(updateLogRoot)
    ? readdirSync(updateLogRoot)
        .filter((entry) => /^update-.*\.jsonl$/.test(entry))
        .sort()
    : [];
}
