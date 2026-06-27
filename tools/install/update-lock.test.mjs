import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acquireUpdateLock, defaultUpdateLockPath } from './update-lock.mjs';

test('update lock rejects a young active updater owner', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-active-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    const first = acquireUpdateLock({
      installRoot: root,
      processId: 1234,
      ownerToken: 'first-owner',
      commandLine: 'node update-bellfield.mjs --confirm=UPDATE',
      now: new Date('2026-06-27T00:00:00.000Z'),
      isProcessAlive: (pid) => pid === 1234,
      getProcessSnapshot: (pid) => ({
        alive: pid === 1234,
        commandLine: '"node" "update-bellfield.mjs" --confirm=UPDATE'
      })
    });

    assert.equal(existsSync(lockPath), true);
    assert.throws(
      () =>
        acquireUpdateLock({
          installRoot: root,
          processId: 5678,
          ownerToken: 'second-owner',
          commandLine: 'second updater',
          now: new Date('2026-06-27T00:01:00.000Z'),
          isProcessAlive: (pid) => pid === 1234,
          getProcessSnapshot: (pid) => ({
            alive: pid === 1234,
            commandLine: '"node" "update-bellfield.mjs" --confirm=UPDATE'
          })
        }),
      (error) => {
        assert.equal(error.code, 'BELLFIELD_UPDATE_LOCKED');
        assert.equal(error.reason, 'owner-process-active');
        assert.equal(error.lockPath, lockPath);
        assert.equal(error.lockOwner.processId, 1234);
        assert.equal(error.requiresOperatorInspection, false);
        return true;
      }
    );

    first.release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock removes a dead owner and writes new metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-dead-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    writeOwner(lockPath, {
      ownerToken: 'dead-owner',
      processId: 1111,
      startedAt: '2026-06-27T00:00:00.000Z',
      commandLine: 'dead updater'
    });

    const next = acquireUpdateLock({
      installRoot: root,
      processId: 2222,
      ownerToken: 'fresh-owner',
      commandLine: 'fresh updater',
      now: new Date('2026-06-27T01:00:00.000Z'),
      isProcessAlive: () => false
    });

    const owner = readOwner(lockPath);
    assert.equal(owner.processId, 2222);
    assert.equal(owner.ownerToken, 'fresh-owner');

    next.release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock removes a PID-reused owner when process identity disproves ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-reused-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    writeOwner(lockPath, {
      ownerToken: 'reused-owner',
      processId: 1111,
      startedAt: '2026-06-27T00:00:00.000Z',
      commandLine: 'node update-bellfield.mjs --confirm=UPDATE'
    });

    const next = acquireUpdateLock({
      installRoot: root,
      processId: 2222,
      ownerToken: 'fresh-owner',
      commandLine: 'fresh updater',
      now: new Date('2026-06-27T00:05:00.000Z'),
      isProcessAlive: (pid) => pid === 1111,
      getProcessSnapshot: (pid) => ({
        alive: pid === 1111,
        commandLine: 'notepad.exe'
      })
    });

    const owner = readOwner(lockPath);
    assert.equal(owner.processId, 2222);
    assert.equal(owner.ownerToken, 'fresh-owner');

    next.release();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock blocks an old live owner with unreadable command line', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-old-live-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    writeOwner(lockPath, {
      ownerToken: 'old-live-owner',
      processId: 1111,
      startedAt: '2026-06-27T00:00:00.000Z',
      commandLine: 'node update-bellfield.mjs --confirm=UPDATE'
    });

    assert.throws(
      () =>
        acquireUpdateLock({
          installRoot: root,
          processId: 2222,
          ownerToken: 'fresh-owner',
          commandLine: 'fresh updater',
          now: new Date('2026-06-27T03:00:00.000Z'),
          maxAgeMs: 60_000,
          isProcessAlive: (pid) => pid === 1111,
          getProcessSnapshot: () => ({ alive: true, commandLine: '' })
        }),
      (error) => {
        assert.equal(error.code, 'BELLFIELD_UPDATE_LOCKED');
        assert.equal(error.reason, 'owner-process-still-appears-active');
        assert.equal(error.requiresOperatorInspection, true);
        assert.ok(error.lockAgeMs >= 60_000);
        assert.deepEqual(error.processSnapshot, { alive: true, commandLine: '' });
        assert.match(error.manualRemediation, /After confirming no BellField update is running/);
        assert.match(error.manualRemediation, new RegExp(escapeRegExp(lockPath)));
        assert.match(error.message, /After confirming no BellField update is running/);
        assert.match(error.message, new RegExp(escapeRegExp(lockPath)));
        return true;
      }
    );

    assert.equal(readOwner(lockPath).ownerToken, 'old-live-owner');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock treats a brand-new ownerless lock as in progress', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-ownerless-new-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    mkdirSync(lockPath, { recursive: true });

    assert.throws(
      () =>
        acquireUpdateLock({
          installRoot: root,
          processId: 2222,
          ownerToken: 'fresh-owner',
          now: new Date(),
          ownerlessGraceMs: 60_000,
          isProcessAlive: () => false
        }),
      (error) => {
        assert.equal(error.code, 'BELLFIELD_UPDATE_LOCKED');
        assert.equal(error.reason, 'ownerless-lock-in-progress');
        assert.equal(error.lockOwner, null);
        return true;
      }
    );

    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock removes an old ownerless lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-ownerless-old-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    mkdirSync(lockPath, { recursive: true });
    const oldTime = new Date('2026-06-27T00:00:00.000Z');
    utimesSync(lockPath, oldTime, oldTime);

    const next = acquireUpdateLock({
      installRoot: root,
      processId: 2222,
      ownerToken: 'fresh-owner',
      commandLine: 'fresh updater',
      now: new Date('2026-06-27T00:01:00.000Z'),
      ownerlessGraceMs: 30_000,
      isProcessAlive: () => false
    });

    assert.equal(readOwner(lockPath).ownerToken, 'fresh-owner');
    next.release();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('update lock does not delete an owner that changed during stale removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-lock-changed-owner-'));
  try {
    const lockPath = defaultUpdateLockPath(root);
    writeOwner(lockPath, {
      ownerToken: 'old-owner',
      processId: 1111,
      startedAt: '2026-06-27T00:00:00.000Z',
      commandLine: 'old updater'
    });

    let replaced = false;
    assert.throws(
      () =>
        acquireUpdateLock({
          installRoot: root,
          processId: 3333,
          ownerToken: 'fresh-owner',
          commandLine: 'fresh updater',
          now: new Date('2026-06-27T00:02:00.000Z'),
          isProcessAlive: (pid) => {
            if (pid === 1111 && !replaced) {
              replaced = true;
              writeOwner(lockPath, {
                ownerToken: 'new-owner',
                processId: 2222,
                startedAt: '2026-06-27T00:01:00.000Z',
                commandLine: 'new updater'
              });
              return false;
            }
            return pid === 2222;
          },
          getProcessSnapshot: (pid) => ({
            alive: pid === 2222,
            commandLine: 'new updater'
          })
        }),
      (error) => {
        assert.equal(error.code, 'BELLFIELD_UPDATE_LOCKED');
        assert.equal(error.lockOwner.ownerToken, 'new-owner');
        return true;
      }
    );

    assert.equal(readOwner(lockPath).ownerToken, 'new-owner');
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
    writeOwner(lockPath, {
      ownerToken: 'different-owner',
      processId: 9999
    });

    first.release();
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function writeOwner(lockPath, owner) {
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(
    join(lockPath, 'owner.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      ...owner
    })}\n`
  );
}

function readOwner(lockPath) {
  return JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
