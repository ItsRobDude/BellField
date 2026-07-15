import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { resolveReleaseStagingRoot } from './release-staging-root.mjs';

test('prefers an existing GitHub runner temp directory for same-drive staging', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-release-staging-'));
  const runnerTemp = join(root, 'runner-temp');
  const systemTemp = join(root, 'system-temp');

  try {
    mkdirSync(runnerTemp);
    mkdirSync(systemTemp);
    assert.equal(resolveReleaseStagingRoot({ runnerTemp, systemTemp }), resolve(runnerTemp));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('falls back to system temp when the runner temp directory is unavailable', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-release-staging-fallback-'));
  const systemTemp = join(root, 'system-temp');

  try {
    mkdirSync(systemTemp);
    assert.equal(
      resolveReleaseStagingRoot({
        runnerTemp: join(root, 'missing-runner-temp'),
        systemTemp
      }),
      resolve(systemTemp)
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
