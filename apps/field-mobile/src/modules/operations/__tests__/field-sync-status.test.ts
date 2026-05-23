import { describe, expect, it } from 'vitest';
import { summarizeSyncHealth } from '../field-sync-status';
import type { PendingOperation, SyncMetadata } from '../field-sync-types';

function buildMetadata(overrides: Partial<SyncMetadata> = {}): SyncMetadata {
  return {
    lastSuccessfulSyncAt: '2026-05-22T09:00:00.000Z',
    lastAttemptedSyncAt: '2026-05-22T09:00:00.000Z',
    lastSnapshotVersion: 'v1',
    lastSyncError: null,
    ...overrides
  };
}

function buildOperation(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    id: 'op-1',
    kind: 'jobNote',
    jobId: 'job-1',
    note: 'queued note',
    occurredAt: '2026-05-22T10:00:00.000Z',
    state: 'pending',
    ...overrides
  } as PendingOperation;
}

describe('summarizeSyncHealth', () => {
  it('stays quiet when nothing is queued, nothing failed, and the device has synced at least once', () => {
    const summary = summarizeSyncHealth(buildMetadata(), []);

    expect(summary.tone).toBe('quiet');
    expect(summary.headline).toBe('Synced');
    expect(summary.pendingCount).toBe(0);
    expect(summary.conflictCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.hasLastSyncError).toBe(false);
  });

  it('flips to attention when queued work exists but nothing is failing', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [buildOperation(), buildOperation({ id: 'op-2' })]);

    expect(summary.tone).toBe('attention');
    expect(summary.headline).toBe('2 changes waiting to sync');
    expect(summary.pendingCount).toBe(2);
  });

  it('uses singular wording for a single pending change', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [buildOperation()]);
    expect(summary.headline).toBe('1 change waiting to sync');
  });

  it('alerts loudly when sync just failed and surfaces the error detail', () => {
    const summary = summarizeSyncHealth(
      buildMetadata({ lastSyncError: 'Network unreachable' }),
      [buildOperation()]
    );

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toContain('Sync failed');
    expect(summary.detail).toBe('Network unreachable');
    expect(summary.pendingCount).toBe(1);
  });

  it('alerts when there are conflicts that need office review', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [
      buildOperation({ state: 'conflict', lastResultMessage: 'Office edited concurrently.' }),
      buildOperation({ id: 'op-2', state: 'conflict' })
    ]);

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toBe('2 conflicts need office review');
    expect(summary.conflictCount).toBe(2);
  });

  it('alerts when items were rejected by the server', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [
      buildOperation({ state: 'rejected', lastResultMessage: 'Permission denied.' })
    ]);

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toBe('1 rejected item needs office review');
    expect(summary.rejectedCount).toBe(1);
  });

  it('alerts and combines counts when both conflicts and rejects exist', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [
      buildOperation({ state: 'conflict' }),
      buildOperation({ id: 'op-2', state: 'rejected' })
    ]);

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toBe('1 conflict and 1 rejected item need office review');
  });

  it('alerts when no successful sync has ever happened on this device', () => {
    const summary = summarizeSyncHealth(
      buildMetadata({ lastSuccessfulSyncAt: null, lastAttemptedSyncAt: null }),
      []
    );

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toBe('Not synced yet on this device');
    expect(summary.detail).toContain('BellField needs at least one successful sync');
  });
});
