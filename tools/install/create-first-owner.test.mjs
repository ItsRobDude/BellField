import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractLatestSetupToken, resolveOwnerCredential } from './create-first-owner.mjs';

function makeLogDir() {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-first-owner-test-'));
  const logDir = join(root, 'data', 'logs', 'services', 'bellfield-api');
  mkdirSync(logDir, { recursive: true });
  return { root, logDir };
}

test('extracts the newest setup token across rotated log files', () => {
  const { root, logDir } = makeLogDir();
  try {
    const older = join(logDir, 'bellfield-api.out.1.log');
    const newer = join(logDir, 'bellfield-api.out.log');
    writeFileSync(
      older,
      'noise\n[Nest] WARN BellField first-owner setup token: OLD_token-1234567890. Use it once at /identity/setup/first-owner; it is not shown in the browser.\n',
      'utf8'
    );
    writeFileSync(
      newer,
      'noise\n[Nest] WARN BellField first-owner setup token: NEW_token-0987654321. Use it once at /identity/setup/first-owner; it is not shown in the browser.\nmore noise\n',
      'utf8'
    );
    const past = new Date(Date.now() - 60_000);
    utimesSync(older, past, past);

    assert.equal(extractLatestSetupToken(logDir), 'NEW_token-0987654321');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('throws with guidance when no token line exists', () => {
  const { root, logDir } = makeLogDir();
  try {
    writeFileSync(join(logDir, 'bellfield-api.out.log'), 'no tokens here\n', 'utf8');
    assert.throws(
      () => extractLatestSetupToken(logDir),
      /GET \/identity\/setup\/status has been called/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('throws when the API log directory does not exist', () => {
  assert.throws(
    () => extractLatestSetupToken(join(tmpdir(), 'bellfield-nonexistent-log-root')),
    /log directory not found/
  );
});

test('dummy-credential flag yields the documented public Gate Day owner', () => {
  // readArgs() represents bare flags as the string 'true'.
  const credential = resolveOwnerCredential({ 'use-gate-day-dummy-credential': 'true' });
  assert.equal(credential.email, 'gate.owner@example.com');
  assert.equal(credential.displayName, 'Gate Day Owner');
  assert.ok(credential.password.length >= 12, 'dummy password satisfies the product minimum');
  assert.equal(credential.usedGateDayDummyCredential, true);
});

test('refuses to run without explicit credentials or the dummy flag', () => {
  assert.throws(() => resolveOwnerCredential({}), /--use-gate-day-dummy-credential/);
  assert.throws(
    () => resolveOwnerCredential({ email: 'a@b.c', 'display-name': 'A' }),
    /--password/
  );
});

test('refuses to mix the dummy flag with explicit credentials', () => {
  assert.throws(
    () =>
      resolveOwnerCredential({
        'use-gate-day-dummy-credential': 'true',
        email: 'someone@example.com'
      }),
    /cannot be combined/
  );
});
