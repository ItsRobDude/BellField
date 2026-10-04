import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createBackupRecoveryMetadata } from './backup-recovery-metadata';
import recoverySettings from './recovery-settings.json';

const build = {
  schemaVersion: 1,
  buildKind: 'release',
  licenseRequired: true,
  version: '0.0.1-recovery.1',
  releaseDate: '2026-10-03',
  generatedAt: '2026-10-03T10:20:30.000Z',
  sourceCommit: 'abcdef1'
};

test('recovery preserves runtime-supported boolean aliases and numeric settings', () => {
  for (const [value, expected] of [
    ['on', 'true'],
    ['off', 'false']
  ]) {
    const { configuration } = createBackupRecoveryMetadata({
      env: {
        BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
        BELLFIELD_BACKUP_ENABLED: value,
        BELLFIELD_BACKUP_INTERVAL_MINUTES: '1e3',
        BELLFIELD_BACKUP_RETENTION_COUNT: '15.0'
      }
    });
    assert.equal(configuration.status, 'captured');
    assert.equal(configuration.settings.BELLFIELD_BACKUP_ENABLED, expected);
    assert.equal(configuration.settings.BELLFIELD_BACKUP_INTERVAL_MINUTES, '1000');
    assert.equal(configuration.settings.BELLFIELD_BACKUP_RETENTION_COUNT, '15');
  }
});

function withFixture(run: (root: string) => void): void {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, 'bellfield-backup-metadata-'));
  try {
    run(root);
  } finally {
    const child = relative(parent, resolve(root));
    assert.ok(
      child.startsWith('bellfield-backup-metadata-') && !child.includes(sep) && !isAbsolute(child)
    );
    rmSync(root, { recursive: true, force: true });
  }
}

function writeBuild(root: string, value: unknown = build): string {
  const manifest = join(root, 'bellfield-build-manifest.json');
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, JSON.stringify(value));
  return manifest;
}

test('backup provenance resolves the source or compiled module root independently of cwd', () => {
  withFixture((root) => {
    writeBuild(root);
    for (const directory of ['src', 'dist']) {
      const metadata = createBackupRecoveryMetadata({
        env: {},
        moduleDirectory: join(root, 'apps', 'worker', directory, 'jobs', 'backup')
      });
      assert.deepEqual(metadata.application, {
        status: 'known',
        buildKind: build.buildKind,
        version: build.version,
        releaseDate: build.releaseDate,
        generatedAt: build.generatedAt,
        sourceCommit: build.sourceCommit
      });
    }
  });
});

test('explicit installed manifest wins over the incoming updater module release', () => {
  withFixture((root) => {
    const incoming = join(root, 'incoming');
    writeBuild(incoming, { ...build, version: 'new-version' });
    const installedManifest = writeBuild(join(root, 'installed'), {
      ...build,
      version: 'old-version'
    });
    const metadata = createBackupRecoveryMetadata({
      env: { BELLFIELD_BUILD_MANIFEST_PATH: installedManifest },
      moduleDirectory: join(incoming, 'apps', 'worker', 'dist', 'jobs', 'backup')
    });
    assert.equal(metadata.application.status, 'known');
    if (metadata.application.status === 'known')
      assert.equal(metadata.application.version, 'old-version');
  });
});

test('missing explicit provenance never falls back to the incoming release', () => {
  withFixture((root) => {
    writeBuild(root);
    assert.deepEqual(
      createBackupRecoveryMetadata({
        env: { BELLFIELD_BUILD_MANIFEST_PATH: join(root, 'missing.json') },
        moduleDirectory: join(root, 'apps', 'worker', 'dist', 'jobs', 'backup')
      }).application,
      { status: 'unknown', reason: 'manifest-missing' }
    );
  });
});

test('source builds preserve explicit provenance and null source commit', () => {
  withFixture((root) => {
    const manifest = writeBuild(root, { ...build, buildKind: 'source', sourceCommit: null });
    const application = createBackupRecoveryMetadata({
      env: { BELLFIELD_BUILD_MANIFEST_PATH: manifest }
    }).application;
    assert.equal(application.status, 'known');
    if (application.status === 'known') {
      assert.equal(application.buildKind, 'source');
      assert.equal(application.sourceCommit, null);
    }
  });
});

test('unavailable provenance stays unknown without inventing a package version', () => {
  withFixture((root) => {
    const application = createBackupRecoveryMetadata({
      env: { npm_package_version: 'must-not-use' },
      moduleDirectory: join(root, 'apps', 'worker', 'src', 'jobs', 'backup')
    }).application;
    assert.deepEqual(application, { status: 'unknown', reason: 'manifest-missing' });
  });
});

test('invalid manifest reports a fixed reason without exposing malformed content', () => {
  withFixture((root) => {
    const manifest = writeBuild(root);
    for (const invalid of [
      'secret-sentinel:not-json',
      JSON.stringify({ ...build, releaseDate: '2026-02-30' }),
      JSON.stringify({ ...build, generatedAt: 'not-a-timestamp' }),
      JSON.stringify({ ...build, sourceCommit: 1 }),
      JSON.stringify({ ...build, version: ' ' }),
      JSON.stringify({ ...build, version: 'version\u0001secret' }),
      JSON.stringify({ ...build, schemaVersion: 2 })
    ]) {
      writeFileSync(manifest, invalid);
      assert.deepEqual(
        createBackupRecoveryMetadata({
          env: { BELLFIELD_BUILD_MANIFEST_PATH: manifest }
        }).application,
        { status: 'unknown', reason: 'manifest-invalid' }
      );
    }
  });
});

test('configuration captures only allowed nonsecret settings with normalized values', () => {
  const configuration = createBackupRecoveryMetadata({
    env: {
      BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
      BELLFIELD_API_PORT: '03001',
      BELLFIELD_OFFICE_WEB_PORT: '3000',
      BELLFIELD_OFFICE_ORIGINS: 'http://localhost:3000, https://shop.example',
      NEXT_PUBLIC_API_BASE_URL: 'https://shop.example/api',
      BELLFIELD_BACKUP_ENABLED: 'YES',
      BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES: '5',
      BELLFIELD_RELAY_BASE_URL: 'https://relay.example',
      BELLFIELD_RELAY_TOKEN: 'relay-secret-sentinel',
      DATABASE_URL: 'database-secret-sentinel',
      BELLFIELD_MEDIA_TOKEN_SECRET: 'media-secret-sentinel',
      BELLFIELD_RELAY_SERVER_INSTANCE_ID: 'old-server-identity',
      BELLFIELD_LICENSE_REQUIRED: 'false',
      BELLFIELD_MEDIA_ROOT: 'old-storage-path',
      BOOTSTRAP_SEED_DATA: 'true',
      UNRECOGNIZED_SETTING: 'other-secret-sentinel'
    }
  }).configuration;
  assert.deepEqual(configuration, {
    status: 'captured',
    settings: {
      BELLFIELD_API_PORT: '3001',
      BELLFIELD_OFFICE_WEB_PORT: '3000',
      BELLFIELD_OFFICE_ORIGINS: 'http://localhost:3000,https://shop.example',
      NEXT_PUBLIC_API_BASE_URL: 'https://shop.example/api',
      BELLFIELD_BACKUP_ENABLED: 'true',
      BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES: '5',
      BELLFIELD_RELAY_BASE_URL: 'https://relay.example'
    },
    relayConfigured: true
  });
  assert.doesNotMatch(
    JSON.stringify(configuration),
    /sentinel|old-server|old-storage|LICENSE_REQUIRED|BOOTSTRAP/
  );
});

test('config completeness requires the explicit full-config marker', () => {
  for (const marker of [undefined, 'false', 'TRUE']) {
    assert.equal(
      createBackupRecoveryMetadata({
        env: {
          BELLFIELD_BACKUP_CONFIG_COMPLETE: marker,
          BELLFIELD_API_PORT: '3001'
        }
      }).configuration.status,
      'partial'
    );
  }
});

test('disabled relay blanks are omitted without making complete config partial', () => {
  assert.deepEqual(
    createBackupRecoveryMetadata({
      env: {
        BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
        BELLFIELD_RELAY_BASE_URL: '',
        BELLFIELD_RELAY_TOKEN: '',
        BELLFIELD_RELAY_SERVER_INSTANCE_ID: 'fresh-id'
      }
    }).configuration,
    { status: 'captured', settings: {}, relayConfigured: false }
  );
});

test('invalid settings are omitted and downgrade completeness without exposing their values', () => {
  for (const [name, value] of [
    ['BELLFIELD_API_PORT', '65536'],
    ['BELLFIELD_BACKUP_RETENTION_COUNT', '0'],
    ['BELLFIELD_MEDIA_MAX_BYTES', '9007199254740992'],
    ['BELLFIELD_BACKUP_ENABLED', 'invalid-secret-sentinel'],
    ['NEXT_PUBLIC_API_BASE_URL', 'https://user:secret-sentinel@shop.example'],
    ['NEXT_PUBLIC_API_BASE_URL', 'https://shop.example?token=secret-sentinel'],
    ['NEXT_PUBLIC_API_BASE_URL', 'https://shop.example?'],
    ['NEXT_PUBLIC_API_BASE_URL', 'https://shop.example#'],
    ['NEXT_PUBLIC_API_BASE_URL', 'https://shop.example/space in path'],
    ['BELLFIELD_RELAY_BASE_URL', 'https://relay.example#secret-sentinel'],
    ['BELLFIELD_OFFICE_ORIGINS', 'https://shop.example/path'],
    ['BELLFIELD_OFFICE_ORIGINS', 'https://shop.example,https://user:secret-sentinel@other.example'],
    ['BELLFIELD_RELAY_BASE_URL', 'file:///secret-sentinel'],
    ['BELLFIELD_RELAY_BASE_URL', 'https://relay.example/\nsecret-sentinel']
  ]) {
    assert.deepEqual(
      createBackupRecoveryMetadata({
        env: {
          BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
          [name]: value
        }
      }).configuration,
      { status: 'partial', settings: {}, relayConfigured: false }
    );
  }
});

test('producer metadata round-trips through the packaged installer contract', async () => {
  const consumerUrl = pathToFileURL(
    resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'tools',
      'install',
      'backup-recovery-metadata.mjs'
    )
  ).href;
  const { validateBackupRecoveryMetadata, recoverySettingNames } = await import(consumerUrl);
  assert.deepEqual(recoverySettingNames, Object.keys(recoverySettings));

  withFixture((root) => {
    const manifest = writeBuild(root);
    const samples: Record<string, string> = {
      port: '03001',
      positiveInteger: '05',
      boolean: 'YES',
      origins: 'https://shop.example, http://localhost:3000/',
      url: 'https://shop.example/api'
    };
    const env: NodeJS.ProcessEnv = {
      BELLFIELD_BUILD_MANIFEST_PATH: manifest,
      BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
      BELLFIELD_RELAY_TOKEN: 'never-serialized-secret'
    };
    for (const [name, type] of Object.entries(recoverySettings)) env[name] = samples[type];
    const recovery = createBackupRecoveryMetadata({ env });
    assert.equal(recovery.configuration.status, 'captured');
    assert.equal(
      Object.keys(recovery.configuration.settings).length,
      Object.keys(recoverySettings).length
    );
    assert.deepEqual(validateBackupRecoveryMetadata({ schemaVersion: 1, recovery }), recovery);

    for (const url of [
      'https://shop.example?',
      'https://shop.example#',
      'https://shop.example/space in path',
      'https://user:never-serialized-secret@shop.example',
      'https://shop.example?token=never-serialized-secret'
    ]) {
      const filtered = createBackupRecoveryMetadata({
        env: { ...env, NEXT_PUBLIC_API_BASE_URL: url }
      });
      assert.equal(filtered.configuration.status, 'partial');
      assert.equal(filtered.configuration.settings.NEXT_PUBLIC_API_BASE_URL, undefined);
      assert.deepEqual(
        validateBackupRecoveryMetadata({ schemaVersion: 1, recovery: filtered }),
        filtered
      );
    }
  });
});
