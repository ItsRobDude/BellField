import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { swapStagedDirectory, swapStagedDirectoryWithRetry } from './restore-staging.mjs';

test('swapStagedDirectoryWithRetry retries a transient swap failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-staging-retry-'));
  try {
    const targetPath = join(root, 'release');
    const stagePath = join(root, 'release.restore-stage-smoke');
    mkdirSync(targetPath);
    mkdirSync(stagePath);
    writeFileSync(join(targetPath, 'old.txt'), 'old');
    writeFileSync(join(stagePath, 'new.txt'), 'new');

    let attempts = 0;
    const rollbackPath = await swapStagedDirectoryWithRetry({
      stagePath,
      targetPath,
      stamp: 'retry-smoke',
      retryDelayMs: 1,
      timeoutMs: 1_000,
      warn() {},
      swapOnce(input) {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('access is denied');
          error.code = 'EACCES';
          throw error;
        }
        return swapStagedDirectory(input);
      }
    });

    assert.equal(attempts, 2);
    assert.equal(existsSync(join(targetPath, 'new.txt')), true);
    assert.equal(existsSync(join(rollbackPath, 'old.txt')), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('swapStagedDirectoryWithRetry restores target from rollback before retrying', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-staging-repair-'));
  try {
    const stamp = 'repair-smoke';
    const targetPath = join(root, 'release');
    const stagePath = join(root, 'release.restore-stage-smoke');
    const rollbackPath = join(dirname(targetPath), `release.restore-rollback-${stamp}`);
    mkdirSync(targetPath);
    mkdirSync(stagePath);
    writeFileSync(join(targetPath, 'old.txt'), 'old');
    writeFileSync(join(stagePath, 'new.txt'), 'new');

    let attempts = 0;
    const finalRollbackPath = await swapStagedDirectoryWithRetry({
      stagePath,
      targetPath,
      stamp,
      retryDelayMs: 1,
      timeoutMs: 1_000,
      warn() {},
      swapOnce(input) {
        attempts += 1;
        if (attempts === 1) {
          renameSync(targetPath, rollbackPath);
          const error = new Error('being used by another process');
          error.code = 'EPERM';
          throw error;
        }
        return swapStagedDirectory(input);
      }
    });

    assert.equal(attempts, 2);
    assert.equal(finalRollbackPath, rollbackPath);
    assert.equal(existsSync(join(targetPath, 'new.txt')), true);
    assert.equal(existsSync(join(finalRollbackPath, 'old.txt')), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('swapStagedDirectoryWithRetry fails clearly when the stage is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-staging-missing-'));
  try {
    const targetPath = join(root, 'release');
    const stagePath = join(root, 'release.restore-stage-missing');
    mkdirSync(targetPath);
    writeFileSync(join(targetPath, 'old.txt'), 'old');

    await assert.rejects(
      () =>
        swapStagedDirectoryWithRetry({
          stagePath,
          targetPath,
          stamp: 'missing-smoke',
          retryDelayMs: 1,
          timeoutMs: 50,
          warn() {}
        }),
      /staged directory is no longer available|staged restore directory is not a directory/
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('swapStagedDirectoryWithRetry exposes swap evidence on permanent failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-staging-evidence-'));
  try {
    const targetPath = join(root, 'release');
    const stagePath = join(root, 'release.restore-stage-evidence');
    mkdirSync(targetPath);
    mkdirSync(stagePath);

    await assert.rejects(
      () =>
        swapStagedDirectoryWithRetry({
          stagePath,
          targetPath,
          stamp: 'evidence-smoke',
          retryDelayMs: 1,
          timeoutMs: 50,
          warn() {},
          swapOnce() {
            throw new Error('not a retryable lock');
          }
        }),
      (error) => {
        assert.match(error.message, /Directory swap failed after 1 attempt/);
        assert.equal(error.swapEvidence.attempts, 1);
        assert.equal(error.swapEvidence.stagePath, stagePath);
        assert.equal(error.swapEvidence.targetPath, targetPath);
        assert.equal(error.swapEvidence.stageExists, true);
        assert.equal(error.swapEvidence.targetExists, true);
        assert.equal(error.swapEvidence.finalCause, 'not a retryable lock');
        return true;
      }
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('swapStagedDirectoryWithRetry repairs from the highest same-stamp rollback suffix', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-staging-suffix-'));
  try {
    const stamp = 'suffix-smoke';
    const targetPath = join(root, 'release');
    const stagePath = join(root, 'release.restore-stage-suffix');
    const rollbackTwo = join(root, `release.restore-rollback-${stamp}-2`);
    const rollbackTen = join(root, `release.restore-rollback-${stamp}-10`);
    mkdirSync(stagePath);
    mkdirSync(rollbackTwo);
    mkdirSync(rollbackTen);
    writeFileSync(join(stagePath, 'new.txt'), 'new');
    writeFileSync(join(rollbackTwo, 'old.txt'), 'two');
    writeFileSync(join(rollbackTen, 'old.txt'), 'ten');

    await assert.rejects(
      () =>
        swapStagedDirectoryWithRetry({
          stagePath,
          targetPath,
          stamp,
          retryDelayMs: 1,
          timeoutMs: 50,
          warn() {},
          swapOnce() {
            const error = new Error('not retryable after repair');
            error.code = 'EINVAL';
            throw error;
          }
        }),
      (error) => {
        assert.equal(error.swapEvidence.rollbackCandidatePath, rollbackTen);
        return true;
      }
    );

    assert.equal(readFileSync(join(targetPath, 'old.txt'), 'utf8'), 'ten');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
