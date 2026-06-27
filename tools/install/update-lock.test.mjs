import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acquireUpdateLock, defaultUpdateLockPath } from './update-lock.mjs';

test('update lock rejects another active updater process', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-active-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    const first = acquireUpdateLock({
      installRoot: root,
      processId: 1234,
      ownerToken: 'first-owner',
      commandLine: 'first updater',
      now: new Date('2026-06-27T00:00:00.000Z'),
      isProcessAlive: (pid) => pid === 1234
    });

    assert.equal(existsSync(lockPath), true);
    assert.throws(
      () =>
        acquireUpdateLock({
          installRoot: root,
          processId: 5678,
          ownerToken: 'second-owner',
          commandLine: 'second updater',
          isProcessAlive: (pid) => pid === 1234
        }),
      (error) => {
        assert.equal(error.code, 'BELLFIELD_UPDATE_LOCKED');
        assert.equal(error.lockPath, lockPath);
        assert.equal(error.lockOwner.processId, 1234);
        return true;
      }
    );

    first.release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock removes a stale owner and writes new metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-stale-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(
      join(lockPath, 'owner.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        ownerToken: 'stale-owner',
        processId: 1111,
        startedAt: '2026-06-27T00:00:00.000Z',
        commandLine: 'stale updater'
      })}\n`
    );

    const next = acquireUpdateLock({
      installRoot: root,
      processId: 2222,
      ownerToken: 'fresh-owner',
      commandLine: 'fresh updater',
      now: new Date('2026-06-27T01:00:00.000Z'),
      isProcessAlive: () => false
    });

    const owner = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
    assert.equal(owner.processId, 2222);
    assert.equal(owner.ownerToken, 'fresh-owner');

    next.release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock release does not remove a different owner', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-owner-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    const first = acquireUpdateLock({
      installRoot: root,
      processId: 1234,
      ownerToken: 'first-owner',
      isProcessAlive: () => false
    });
    writeFileSync(
      join(lockPath, 'owner.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        ownerToken: 'different-owner',
        processId: 9999
      })}\n`
    );

    first.release();
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
