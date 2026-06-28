import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createUpdateEvidenceLog } from './update-evidence-log.mjs';

test('update evidence log writes parseable JSONL under the install log root', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-log-'));
  try {
    const installRoot = join(root, 'BellField');
    const log = createUpdateEvidenceLog({
      installRoot,
      now: () => new Date('2026-06-28T01:02:03Z')
    });

    assert.match(log.logPath, /data[\\/]logs[\\/]update[\\/]update-20260628-010203Z\.jsonl$/);
    log.writeEvent('BELLFIELD_UPDATE_PHASE', { phase: 'verifying' });
    log.writeEvent('BELLFIELD_UPDATE_RESULT', { status: 'succeeded' });

    const lines = readJsonLines(log.logPath);
    assert.deepEqual(
      lines.map((line) => line.event),
      ['BELLFIELD_UPDATE_PHASE', 'BELLFIELD_UPDATE_RESULT']
    );
    assert.equal(lines[0].timestamp, '2026-06-28T01:02:03.000Z');
    assert.equal(lines[0].phase, 'verifying');
    assert.equal(lines[1].status, 'succeeded');
    log.close();
    log.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('update evidence log is readable immediately after a thrown path', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-log-'));
  try {
    const log = createUpdateEvidenceLog({
      installRoot: join(root, 'BellField'),
      now: () => new Date('2026-06-28T02:03:04Z')
    });

    assert.throws(() => {
      log.writeEvent('BELLFIELD_UPDATE_FAILURE', { status: 'failed', phase: 'migrating' });
      throw new Error('simulated updater failure');
    }, /simulated updater failure/);

    const lines = readJsonLines(log.logPath);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'BELLFIELD_UPDATE_FAILURE');
    assert.equal(lines[0].phase, 'migrating');
    log.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('update evidence log writes fatal records synchronously', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-update-log-'));
  try {
    const log = createUpdateEvidenceLog({
      installRoot: join(root, 'BellField'),
      now: () => new Date('2026-06-28T03:04:05Z')
    });

    log.writeFatal({ status: 'fatal', error: { message: 'fatal path' } });

    const [record] = readJsonLines(log.logPath);
    assert.equal(record.event, 'BELLFIELD_UPDATE_FATAL');
    assert.equal(record.error.message, 'fatal path');
    log.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readJsonLines(path) {
  return readFileSync(path, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
