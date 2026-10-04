import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createBackupSourceEnv } from './backup-source-env.mjs';

test('backup settings mask shell inheritance and explicitly identify the installed release', () => {
  const installed = resolve('fixture-installed-release');
  const source = createBackupSourceEnv({ BELLFIELD_API_PORT: '4301' }, installed);
  assert.equal(source.BELLFIELD_API_PORT, '4301');
  assert.equal(source.BELLFIELD_OFFICE_ORIGINS, '');
  assert.equal(
    source.BELLFIELD_BUILD_MANIFEST_PATH,
    join(installed, 'bellfield-build-manifest.json')
  );
  assert.equal(source.BELLFIELD_BACKUP_CONFIG_COMPLETE, 'true');
  assert.equal('DATABASE_URL' in source, false);
  assert.equal(source.BELLFIELD_RELAY_TOKEN, '');
  assert.equal(source.BELLFIELD_RELAY_SERVER_INSTANCE_ID, '');
});

test('scheduled service and manual wrapper pass the same recovery settings', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-backup-source-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  const release = join(root, 'release');
  const install = join(root, 'install');
  const runtime = join(release, 'runtime', 'node');
  const worker = join(release, 'apps', 'worker', 'dist', 'jobs', 'backup');
  const postgres = join(release, 'postgres', 'bin');
  for (const path of [install, runtime, worker, postgres]) mkdirSync(path, { recursive: true });
  copyFileSync(process.execPath, join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'));
  writeFileSync(join(postgres, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'), 'unused');
  const serverEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/fixture',
    BELLFIELD_API_PORT: '4301',
    BELLFIELD_OFFICE_WEB_PORT: '4300',
    BELLFIELD_OFFICE_ORIGINS: 'https://shop.example',
    NEXT_PUBLIC_API_BASE_URL: 'https://shop.example/api',
    BELLFIELD_OFFICE_SESSION_TTL_HOURS: '8',
    BELLFIELD_BACKUP_RETENTION_COUNT: '12',
    BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES: '4',
    BELLFIELD_PAYMENT_EVENTS_INTERVAL_SECONDS: '75'
  };
  const envPath = join(install, 'bellfield-server.env');
  writeFileSync(
    envPath,
    Object.entries(serverEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  );
  const expected = createBackupSourceEnv(serverEnv, release);
  const capturedPath = join(root, 'captured.json');
  writeFileSync(
    join(worker, 'run-backup-cli.js'),
    `
    const fs = require('node:fs');
    const names = ${JSON.stringify(Object.keys(expected))};
    fs.writeFileSync(${JSON.stringify(capturedPath)}, JSON.stringify(
      Object.fromEntries(names.map(name => [name, process.env[name]]))
    ));
    console.log('BELLFIELD_BACKUP_RESULT ' + JSON.stringify({status:'succeeded',backupSetPath:'fixture'}));
  `
  );
  const extraEnv = {
    ...process.env,
    BELLFIELD_FIELD_SESSION_TTL_DAYS: '999',
    BELLFIELD_RELAY_BASE_URL: 'https://unrelated-relay.example',
    BELLFIELD_RELAY_TOKEN: 'unrelated-shell-token',
    BELLFIELD_RELAY_SERVER_INSTANCE_ID: 'unrelated-shell-instance',
    BELLFIELD_BUILD_MANIFEST_PATH: join(root, 'unrelated-incoming-release.json')
  };
  for (const script of ['render-windows-services.mjs', 'run-packaged-backup.mjs']) {
    const result = spawnSync(
      process.execPath,
      [
        resolve('tools/install', script),
        `--release-root=${release}`,
        `--install-root=${install}`,
        `--env=${envPath}`
      ],
      { encoding: 'utf8', env: extraEnv, timeout: 20_000 }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  assert.deepEqual(JSON.parse(readFileSync(capturedPath, 'utf8')), expected);
  const workerXml = readFileSync(join(release, 'services', 'bellfield-worker.xml'), 'utf8');
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(workerXml.includes(`<env name="${key}" value="${value}" />`), `missing ${key}`);
  }
});
