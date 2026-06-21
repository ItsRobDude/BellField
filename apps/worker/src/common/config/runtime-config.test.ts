import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getWorkerRuntimeConfig } from './runtime-config';

const validProductionDatabaseUrl = 'postgresql://app:secret@db.internal:5432/bellfield';

const envKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'BELLFIELD_MEDIA_ROOT',
  'BELLFIELD_LICENSE_PATH',
  'BELLFIELD_BACKUP_ENABLED',
  'BELLFIELD_BACKUP_ROOT',
  'BELLFIELD_BACKUP_INTERVAL_MINUTES',
  'BELLFIELD_BACKUP_RETENTION_COUNT',
  'BELLFIELD_BACKUP_STALE_AFTER_HOURS',
  'BELLFIELD_POSTGRES_BIN',
  'BELLFIELD_PG_DUMP_PATH',
  'BELLFIELD_RELAY_BASE_URL',
  'BELLFIELD_RELAY_TOKEN',
  'BELLFIELD_RELAY_SERVER_INSTANCE_ID',
  'BELLFIELD_DELIVERY_RETRY_INTERVAL_SECONDS',
  'BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES',
  'BELLFIELD_ACCEPTANCE_DECISIONS_INTERVAL_SECONDS',
  'BELLFIELD_PAYMENT_EVENTS_INTERVAL_SECONDS'
] as const;

const original: Record<(typeof envKeys)[number], string | undefined> = Object.create(null);

beforeEach(() => {
  for (const key of envKeys) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

test('reads the relay client config when all three values are set', () => {
  setProductionWorkerEnv();
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.bellfield.app/';
  process.env.BELLFIELD_RELAY_TOKEN = '  bfrt1_token_value  ';
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'instance-uuid-1';

  const config = getWorkerRuntimeConfig();

  assert.deepEqual(config.relay, {
    baseUrl: 'https://relay.bellfield.app',
    token: 'bfrt1_token_value',
    serverInstanceId: 'instance-uuid-1'
  });
});

test('treats fully absent relay config as not configured', () => {
  setProductionWorkerEnv();

  const config = getWorkerRuntimeConfig();

  assert.equal(config.relay, undefined);
});

test('treats generated instance id alone as relay disabled in production', () => {
  setProductionWorkerEnv();
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'generated-instance-id';

  const config = getWorkerRuntimeConfig();

  assert.equal(config.relay, undefined);
});

test('refuses relay base URL without token in production', () => {
  setProductionWorkerEnv();
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.bellfield.app';

  assert.throws(() => getWorkerRuntimeConfig(), /BELLFIELD_RELAY_TOKEN/);
});

test('refuses relay token without base URL in production', () => {
  setProductionWorkerEnv();
  process.env.BELLFIELD_RELAY_TOKEN = 'bfrt1_token_value';

  assert.throws(() => getWorkerRuntimeConfig(), /BELLFIELD_RELAY_BASE_URL/);
});

test('refuses relay credentials without server instance id in production', () => {
  setProductionWorkerEnv();
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.bellfield.app';
  process.env.BELLFIELD_RELAY_TOKEN = 'bfrt1_token_value';

  assert.throws(() => getWorkerRuntimeConfig(), /BELLFIELD_RELAY_SERVER_INSTANCE_ID/);
});

test('treats partial relay config as not configured outside production', () => {
  process.env.NODE_ENV = 'development';
  process.env.BELLFIELD_RELAY_BASE_URL = 'http://localhost:3201';

  const config = getWorkerRuntimeConfig();

  assert.equal(config.relay, undefined);
});

function setProductionWorkerEnv() {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = validProductionDatabaseUrl;
  process.env.BELLFIELD_MEDIA_ROOT = join(tmpdir(), 'bellfield-media');
  process.env.BELLFIELD_BACKUP_ROOT = join(tmpdir(), 'bellfield-backups');
}
