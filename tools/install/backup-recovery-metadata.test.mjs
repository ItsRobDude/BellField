import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkRestoreReleaseCompatibility,
  readApplicationProvenance,
  readBackupRecoveryMetadata,
  recoverySettingNames,
  validateBackupRecoveryMetadata
} from './backup-recovery-metadata.mjs';
import { parseEnvFile } from './install-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const knownApplication = {
  status: 'known',
  buildKind: 'release',
  version: '0.0.1-gateday.55',
  releaseDate: '2026-07-07',
  generatedAt: '2026-07-07T12:00:00.000Z',
  sourceCommit: '2d0670f'
};

function fixtureDatabaseUrl(host, username, password, database) {
  return ['postgresql://', username, ':', password, '@', host, '/', database].join('');
}

function backupManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    recovery: {
      schemaVersion: 1,
      application: { ...knownApplication },
      configuration: {
        status: 'captured',
        settings: {
          BELLFIELD_API_PORT: '4123',
          BELLFIELD_OFFICE_WEB_PORT: '4124',
          BELLFIELD_OFFICE_ORIGINS: 'http://192.0.2.20:4124',
          NEXT_PUBLIC_API_BASE_URL: 'http://192.0.2.20:4123',
          BELLFIELD_OFFICE_SESSION_TTL_HOURS: '10',
          BELLFIELD_BACKUP_ENABLED: 'false',
          BELLFIELD_RELAY_BASE_URL: 'https://relay.example.test'
        },
        relayConfigured: true
      },
      ...overrides
    }
  };
}

function tempRoot(context) {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-recovery-metadata-'));
  context.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('bellfield-recovery-metadata-'));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data), 'utf8');
}

function runCli(name, args, env = {}) {
  return spawnSync(process.execPath, [join(scriptDir, name), ...args], {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, ...env }
  });
}

function treeSnapshot(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? [[path, 'directory'], ...treeSnapshot(path)]
      : [[path, readFileSync(path, 'base64')]];
  });
}

test('recovery envelope preserves validated nonsecret settings and known source identity', () => {
  const manifest = backupManifest();
  assert.deepEqual(validateBackupRecoveryMetadata(manifest), manifest.recovery);
  assert.ok(recoverySettingNames.includes('BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES'));
  for (const excluded of [
    'DATABASE_URL',
    'BELLFIELD_MEDIA_TOKEN_SECRET',
    'BELLFIELD_RELAY_TOKEN',
    'BELLFIELD_RELAY_SERVER_INSTANCE_ID',
    'BELLFIELD_LICENSE_REQUIRED',
    'BELLFIELD_MEDIA_ROOT'
  ]) {
    assert.ok(!recoverySettingNames.includes(excluded));
  }
});

test('legacy absence is distinct from malformed or unsupported metadata', () => {
  assert.equal(validateBackupRecoveryMetadata({ schemaVersion: 1 }), null);
  for (const manifest of [
    null,
    [],
    {},
    { schemaVersion: 2 },
    { schemaVersion: 1, recovery: null },
    backupManifest({ schemaVersion: 2 }),
    backupManifest({ application: { status: 'unknown', reason: 'invented' } }),
    backupManifest({ configuration: { status: 'captured', settings: {}, relayConfigured: 'yes' } })
  ]) {
    assert.throws(() => validateBackupRecoveryMetadata(manifest));
  }
});

test('unknown keys, credentials, unsafe URLs, invalid types, and multiline values are refused without echo', () => {
  const settingsCases = [
    { DATABASE_URL: fixtureDatabaseUrl('localhost', 'user', 'do-not-echo', 'data') },
    { 'do-not-echo': 'value' },
    { BELLFIELD_API_PORT: '65536' },
    { BELLFIELD_API_PORT: '1.5' },
    { BELLFIELD_BACKUP_RETENTION_COUNT: '9007199254740992' },
    { BELLFIELD_BACKUP_ENABLED: 'yes' },
    { BELLFIELD_API_PORT: '3001\nDATABASE_URL=do-not-echo' },
    { BELLFIELD_RELAY_BASE_URL: ['https://user:', 'do-not-echo', '@example.test'].join('') },
    { BELLFIELD_RELAY_BASE_URL: 'https://example.test/?token=do-not-echo' },
    { BELLFIELD_RELAY_BASE_URL: 'https://example.test/#do-not-echo' },
    { BELLFIELD_RELAY_BASE_URL: 'https://example.test/?' },
    { BELLFIELD_RELAY_BASE_URL: 'https://example.test/#' },
    { NEXT_PUBLIC_API_BASE_URL: 'file:///data' },
    { BELLFIELD_OFFICE_ORIGINS: 'https://example.test/path' },
    { BELLFIELD_OFFICE_ORIGINS: 'https://example.test,' },
    { BELLFIELD_API_PORT: 3001 }
  ];
  for (const settings of settingsCases) {
    assert.throws(
      () =>
        validateBackupRecoveryMetadata(
          backupManifest({
            configuration: { status: 'partial', settings, relayConfigured: false }
          })
        ),
      (error) => {
        assert.match(error.message, /invalid setting/);
        assert.doesNotMatch(error.message, /do-not-echo/);
        return true;
      }
    );
  }
});

test('known application requires valid calendar/date and safe identity fields', () => {
  for (const override of [
    { releaseDate: '2026-02-30' },
    { generatedAt: 'not-a-date' },
    { version: '' },
    { sourceCommit: undefined },
    { sourceCommit: 'unsafe\u001bidentity' },
    { buildKind: 'development' }
  ]) {
    assert.throws(() =>
      validateBackupRecoveryMetadata(
        backupManifest({
          application: { ...knownApplication, ...override }
        })
      )
    );
  }
  assert.equal(
    validateBackupRecoveryMetadata(
      backupManifest({
        application: { ...knownApplication, buildKind: 'source', sourceCommit: null }
      })
    ).application.sourceCommit,
    null
  );
});

test('compatibility compares version, commit and build kind without ordering dates', () => {
  assert.equal(
    checkRestoreReleaseCompatibility({
      source: knownApplication,
      destination: {
        ...knownApplication,
        releaseDate: '2020-01-01',
        generatedAt: '2020-01-01T00:00:00Z'
      }
    }),
    'matching'
  );
  for (const change of [
    { version: '0.0.1-gateday.56' },
    { sourceCommit: 'abcdef0' },
    { buildKind: 'source' }
  ]) {
    const input = { source: knownApplication, destination: { ...knownApplication, ...change } };
    assert.throws(() => checkRestoreReleaseCompatibility(input), /do not match/);
    assert.throws(
      () => checkRestoreReleaseCompatibility({ ...input, allowUnknownRelease: true }),
      /do not match/
    );
    assert.equal(
      checkRestoreReleaseCompatibility({ ...input, allowReleaseMismatch: true }),
      'release-mismatch-allowed'
    );
  }
});

test('unknown provenance requires its own override, while malformed identity is never bypassed', () => {
  for (const source of [null, { status: 'unknown', reason: 'manifest-missing' }]) {
    const input = { source, destination: knownApplication, allowReleaseMismatch: true };
    assert.throws(() => checkRestoreReleaseCompatibility(input), /allow-unknown-release/);
    assert.equal(
      checkRestoreReleaseCompatibility({ ...input, allowUnknownRelease: true }),
      'unknown-release-allowed'
    );
  }
  const missingDestination = { status: 'unknown', reason: 'manifest-invalid' };
  assert.throws(
    () =>
      checkRestoreReleaseCompatibility({
        source: knownApplication,
        destination: missingDestination
      }),
    /allow-unknown-release/
  );
  assert.throws(
    () =>
      checkRestoreReleaseCompatibility({
        source: { ...knownApplication, version: '' },
        destination: knownApplication,
        allowUnknownRelease: true,
        allowReleaseMismatch: true
      }),
    /Invalid application/
  );
});

test('destination manifests enforce build schema and legacy backups parse explicitly', (context) => {
  const root = tempRoot(context);
  const path = join(root, 'bellfield-build-manifest.json');
  assert.deepEqual(readApplicationProvenance(path), {
    status: 'unknown',
    reason: 'manifest-missing'
  });
  const { status: _status, ...manifest } = knownApplication;
  writeJson(path, { ...manifest, schemaVersion: 1, licenseRequired: true });
  assert.deepEqual(readApplicationProvenance(path), knownApplication);
  writeJson(path, { ...manifest, schemaVersion: 1 });
  assert.deepEqual(readApplicationProvenance(path), {
    status: 'unknown',
    reason: 'manifest-invalid'
  });
  writeFileSync(path, '{malformed');
  assert.deepEqual(readApplicationProvenance(path), {
    status: 'unknown',
    reason: 'manifest-invalid'
  });
  writeJson(join(root, 'manifest.json'), { schemaVersion: 1 });
  assert.equal(readBackupRecoveryMetadata(root), null);
});

test('packaged helper uses dist allowlist and source checkout prefers source independent of cwd', async (context) => {
  const root = tempRoot(context);
  const script = join(root, 'tools/install/backup-recovery-metadata.mjs');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(join(scriptDir, 'backup-recovery-metadata.mjs'), script);
  writeJson(join(root, 'apps/worker/dist/jobs/backup/recovery-settings.json'), {
    BELLFIELD_API_PORT: 'port'
  });
  const packaged = await import(pathToFileURL(script).href);
  assert.deepEqual(packaged.recoverySettingNames, ['BELLFIELD_API_PORT']);
  writeJson(join(root, 'apps/worker/src/jobs/backup/recovery-settings.json'), {
    BELLFIELD_OFFICE_WEB_PORT: 'port'
  });
  const source = await import(`${pathToFileURL(script).href}?source`);
  assert.deepEqual(source.recoverySettingNames, ['BELLFIELD_OFFICE_WEB_PORT']);
});

test('configuration recovery restores safe settings and comments but regenerates secrets, identity and paths', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  writeJson(join(backup, 'manifest.json'), backupManifest());
  const generated = [];
  for (const label of ['first', 'second']) {
    const installRoot = join(root, label);
    const result = runCli(
      'write-server-config.mjs',
      [`--install-root=${installRoot}`, `--from-backup=${backup}`],
      {
        DATABASE_URL: fixtureDatabaseUrl('old-host', 'old', 'do-not-echo', 'old-db'),
        BELLFIELD_MEDIA_TOKEN_SECRET: 'do-not-echo',
        BELLFIELD_RELAY_TOKEN: 'do-not-echo',
        BELLFIELD_RELAY_SERVER_INSTANCE_ID: 'old-instance'
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /do-not-echo|relay\.example\.test/);
    const output = join(installRoot, 'bellfield-server.env');
    const config = parseEnvFile(output);
    assert.equal(config.BELLFIELD_API_PORT, '4123');
    assert.equal(config.BELLFIELD_OFFICE_SESSION_TTL_HOURS, '10');
    assert.equal(config.BELLFIELD_OFFICE_ORIGINS, 'http://192.0.2.20:4124');
    assert.equal(config.BELLFIELD_BACKUP_ENABLED, 'false');
    assert.equal(config.BELLFIELD_RELAY_BASE_URL, '');
    assert.equal(config.BELLFIELD_RELAY_TOKEN, '');
    assert.equal(config.BELLFIELD_MEDIA_ROOT, join(installRoot, 'data/media'));
    assert.equal(config.BELLFIELD_BACKUP_ROOT, join(installRoot, 'data/backups'));
    assert.equal(config.BELLFIELD_LICENSE_REQUIRED, 'true');
    assert.equal(new URL(config.DATABASE_URL).hostname, '127.0.0.1');
    assert.notEqual(config.BELLFIELD_RELAY_SERVER_INSTANCE_ID, 'old-instance');
    assert.match(readFileSync(output, 'utf8'), /# API service/);
    generated.push(config);
  }
  for (const key of [
    'DATABASE_URL',
    'BELLFIELD_MEDIA_TOKEN_SECRET',
    'BELLFIELD_RELAY_SERVER_INSTANCE_ID'
  ]) {
    assert.notEqual(generated[0][key], generated[1][key]);
  }
});

test('fresh and recovered configuration preserve literal replacement characters in install paths', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  writeJson(join(backup, 'manifest.json'), backupManifest());
  for (const recover of [false, true]) {
    const installRoot = join(root, `shop $& office = ${recover}`);
    const result = runCli('write-server-config.mjs', [
      `--install-root=${installRoot}`,
      ...(recover ? [`--from-backup=${backup}`] : [])
    ]);
    assert.equal(result.status, 0, result.stderr);
    const config = parseEnvFile(join(installRoot, 'bellfield-server.env'));
    assert.equal(config.BELLFIELD_MEDIA_ROOT, join(installRoot, 'data/media'));
    assert.equal(config.BELLFIELD_BACKUP_ROOT, join(installRoot, 'data/backups'));
    assert.equal(
      config.BELLFIELD_LICENSE_PATH,
      join(installRoot, 'data/license/bellfield-license.json')
    );
    assert.ok(existsSync(config.BELLFIELD_MEDIA_ROOT));
    assert.ok(existsSync(config.BELLFIELD_BACKUP_ROOT));
    assert.ok(existsSync(dirname(config.BELLFIELD_LICENSE_PATH)));
  }
});

test('configuration refuses legacy, force, or invalid recovery metadata without creating output', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  const outputRoot = join(root, 'must-not-exist');
  for (const [manifest, extraArgs, expected] of [
    [{ schemaVersion: 1 }, [], /legacy backup/],
    [backupManifest(), ['--force=true'], /cannot be combined/],
    [backupManifest({ schemaVersion: 2 }), [], /Unsupported backup recovery/],
    [
      backupManifest({
        configuration: {
          status: 'captured',
          settings: { DATABASE_URL: 'do-not-echo' },
          relayConfigured: false
        }
      }),
      [],
      /invalid setting/
    ]
  ]) {
    writeJson(join(backup, 'manifest.json'), manifest);
    const result = runCli('write-server-config.mjs', [
      `--install-root=${outputRoot}`,
      `--from-backup=${backup}`,
      ...extraArgs
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /do-not-echo/);
    assert.equal(existsSync(outputRoot), false);
  }
});

test('configuration recovery preserves existing output and reports partial defaults', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  writeJson(
    join(backup, 'manifest.json'),
    backupManifest({
      configuration: { status: 'partial', settings: {}, relayConfigured: false }
    })
  );
  const installRoot = join(root, 'install');
  const args = [`--install-root=${installRoot}`, `--from-backup=${backup}`];
  const first = runCli('write-server-config.mjs', args);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /not captured; review template defaults/);
  const before = treeSnapshot(installRoot);
  const second = runCli('write-server-config.mjs', args);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /fresh output file/);
  assert.deepEqual(treeSnapshot(installRoot), before);
});

test('restore identity/schema refusal happens before filesystem, service or database effects', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  const release = join(root, 'release');
  const install = join(root, 'install');
  mkdirSync(join(backup, 'media'), { recursive: true });
  mkdirSync(join(install, 'data/media'), { recursive: true });
  writeFileSync(join(backup, 'database.dump'), 'not-a-real-dump');
  writeFileSync(join(backup, 'media/new.txt'), 'backup media');
  writeFileSync(join(install, 'data/media/original.txt'), 'preserve original');
  const envPath = join(install, 'bellfield-server.env');
  writeFileSync(
    envPath,
    [
      `DATABASE_URL=${fixtureDatabaseUrl('127.0.0.1:1', 'test', 'test', 'test')}`,
      `BELLFIELD_MEDIA_ROOT=${join(install, 'data/media')}`,
      'BELLFIELD_LICENSE_REQUIRED=false'
    ].join('\n')
  );
  const { status: _status, ...destination } = knownApplication;
  writeJson(join(release, 'bellfield-build-manifest.json'), {
    ...destination,
    schemaVersion: 1,
    licenseRequired: true,
    sourceCommit: 'different-commit'
  });
  const args = [
    '--confirm=RESTORE',
    `--backup-set=${backup}`,
    `--release-root=${release}`,
    `--install-root=${install}`,
    '--skip-services=true'
  ];
  for (const [manifest, extraArgs, expected] of [
    [backupManifest(), [], /do not match/],
    [{ schemaVersion: 1 }, [], /allow-unknown-release/],
    [
      backupManifest({ schemaVersion: 2 }),
      ['--allow-release-mismatch=true', '--allow-unknown-release=true'],
      /Unsupported backup recovery/
    ]
  ]) {
    writeJson(join(backup, 'manifest.json'), manifest);
    const before = treeSnapshot(root);
    const result = runCli('restore-backup.mjs', [...args, ...extraArgs]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stdout, /Staged|Skipping Windows service/);
    assert.deepEqual(treeSnapshot(root), before);
  }
});

test('explicit legacy identity override does not bypass the required backup license', (context) => {
  const root = tempRoot(context);
  const backup = join(root, 'backup');
  const install = join(root, 'install');
  mkdirSync(join(backup, 'media'), { recursive: true });
  mkdirSync(install, { recursive: true });
  writeJson(join(backup, 'manifest.json'), { schemaVersion: 1 });
  writeFileSync(join(backup, 'database.dump'), 'not-a-real-dump');
  writeFileSync(
    join(install, 'bellfield-server.env'),
    [
      `DATABASE_URL=${fixtureDatabaseUrl('127.0.0.1:1', 'test', 'test', 'test')}`,
      `BELLFIELD_MEDIA_ROOT=${join(install, 'data/media')}`,
      'BELLFIELD_LICENSE_REQUIRED=true',
      `BELLFIELD_LICENSE_PATH=${join(install, 'data/license/bellfield-license.json')}`
    ].join('\n')
  );
  const before = treeSnapshot(root);
  const result = runCli('restore-backup.mjs', [
    '--confirm=RESTORE',
    `--backup-set=${backup}`,
    `--install-root=${install}`,
    `--release-root=${join(root, 'missing-destination-provenance')}`,
    '--allow-unknown-release=true',
    '--skip-services=true'
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /unknown-release-allowed/);
  assert.match(result.stderr, /does not include license/);
  assert.deepEqual(treeSnapshot(root), before);
});
