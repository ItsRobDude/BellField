import { describe, expect, it } from 'vitest';
import { buildSuccessfulSyncMetadata, summarizeSyncHealth } from '../field-sync-status';
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
    const summary = summarizeSyncHealth(buildMetadata(), [
      buildOperation(),
      buildOperation({ id: 'op-2' })
    ]);

    expect(summary.tone).toBe('attention');
    expect(summary.headline).toBe('2 changes waiting to sync');
    expect(summary.pendingCount).toBe(2);
  });

  it('uses singular wording for a single pending change', () => {
    const summary = summarizeSyncHealth(buildMetadata(), [buildOperation()]);
    expect(summary.headline).toBe('1 change waiting to sync');
  });

  it('alerts loudly when sync just failed and surfaces the error detail', () => {
    const summary = summarizeSyncHealth(buildMetadata({ lastSyncError: 'Network unreachable' }), [
      buildOperation()
    ]);

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

describe('buildSuccessfulSyncMetadata', () => {
  it('marks a successful assigned-work fetch as the latest successful sync', () => {
    const metadata = buildSuccessfulSyncMetadata(
      buildMetadata({
        lastSuccessfulSyncAt: null,
        lastAttemptedSyncAt: null,
        lastSyncError: 'Network unreachable'
      }),
      'v2',
      '2026-05-22T10:00:00.000Z'
    );

    expect(metadata).toMatchObject({
      lastAttemptedSyncAt: '2026-05-22T10:00:00.000Z',
      lastSuccessfulSyncAt: '2026-05-22T10:00:00.000Z',
      lastSnapshotVersion: 'v2',
      lastSyncError: null
    });
    expect(summarizeSyncHealth(metadata, []).tone).toBe('quiet');
  });

  it('preserves the sync attempt time when replay finishes later', () => {
    const metadata = buildSuccessfulSyncMetadata(
      buildMetadata(),
      'v3',
      '2026-05-22T10:03:00.000Z',
      '2026-05-22T10:00:00.000Z'
    );

    expect(metadata.lastAttemptedSyncAt).toBe('2026-05-22T10:00:00.000Z');
    expect(metadata.lastSuccessfulSyncAt).toBe('2026-05-22T10:03:00.000Z');
  });

  it('clears a previous lastSyncError once the refresh succeeds', () => {
    const metadata = buildSuccessfulSyncMetadata(
      buildMetadata({ lastSyncError: 'Network unreachable' }),
      'v4',
      '2026-05-22T10:04:00.000Z'
    );

    expect(metadata.lastSyncError).toBeNull();
    expect(summarizeSyncHealth(metadata, []).tone).toBe('quiet');
  });

  it('keeps the field assignment story trustworthy: refresh after office reassigns goes quiet again', () => {
    const stale = buildMetadata({
      lastSyncError: 'Network unreachable',
      lastSuccessfulSyncAt: null,
      lastAttemptedSyncAt: null
    });
    expect(summarizeSyncHealth(stale, []).tone).toBe('alert');

    const fresh = buildSuccessfulSyncMetadata(stale, 'v5', '2026-05-22T10:10:00.000Z');
    expect(summarizeSyncHealth(fresh, []).tone).toBe('quiet');
    expect(summarizeSyncHealth(fresh, []).headline).toBe('Synced');
  });
});
