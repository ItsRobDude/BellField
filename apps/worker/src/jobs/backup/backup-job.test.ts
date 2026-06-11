import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateInitialBackupDelayMs, createScheduledBackupJob } from './backup-job';
import type { BackupService } from './backup-service';

test('calculateInitialBackupDelayMs runs immediately when no successful backup exists', () => {
  assert.equal(calculateInitialBackupDelayMs(null, 60_000, new Date('2026-06-11T02:00:00Z')), 0);
});

test('calculateInitialBackupDelayMs runs immediately when the last success is stale', () => {
  assert.equal(
    calculateInitialBackupDelayMs(
      '2026-06-11T00:00:00.000Z',
      60 * 60 * 1000,
      new Date('2026-06-11T02:00:00.000Z')
    ),
    0
  );
});

test('calculateInitialBackupDelayMs waits only the remaining interval after a recent success', () => {
  assert.equal(
    calculateInitialBackupDelayMs(
      '2026-06-11T01:30:00.000Z',
      60 * 60 * 1000,
      new Date('2026-06-11T02:00:00.000Z')
    ),
    30 * 60 * 1000
  );
});

test('createScheduledBackupJob prepares recovery state before choosing startup delay', async () => {
  let prepared = false;
  const backupService = {
    prepareForScheduling: async () => {
      prepared = true;
      return {
        latestSuccessfulRun: { completedAt: '2026-06-11T01:45:00.000Z' },
        orphanedRunningRunsFailed: 1,
        removedPartialBackupSetPaths: ['C:\\BellField\\data\\backups\\bellfield-backup-partial']
      };
    },
    runBackup: async () => undefined
  } as unknown as BackupService;
  const logs: Array<{ level: string; message: string; context?: unknown }> = [];

  const job = await createScheduledBackupJob({
    backupService,
    intervalMs: 60 * 60 * 1000,
    now: () => new Date('2026-06-11T02:00:00.000Z'),
    log: (level, message, context) => logs.push({ level, message, context })
  });

  assert.equal(prepared, true);
  assert.equal(job.initialDelayMs, 45 * 60 * 1000);
  assert.equal(logs[0]?.level, 'info');
});
