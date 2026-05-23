import type { PendingOperation, SyncMetadata } from './field-sync-types';

export type SyncTone = 'quiet' | 'attention' | 'alert';

export type SyncHealthSummary = {
  tone: SyncTone;
  headline: string;
  detail?: string;
  pendingCount: number;
  conflictCount: number;
  rejectedCount: number;
  hasLastSyncError: boolean;
};

/**
 * BellField field sync indicator is supposed to stay quiet unless work is at risk.
 * Quiet => background sync working as expected.
 * Attention => unsynced edits exist but nothing is failing.
 * Alert => sync just failed, conflicts/rejects need human review, or the device has never synced.
 */
export function summarizeSyncHealth(
  metadata: SyncMetadata,
  pendingOperations: PendingOperation[]
): SyncHealthSummary {
  const pendingCount = pendingOperations.filter((operation) => operation.state === 'pending').length;
  const conflictCount = pendingOperations.filter((operation) => operation.state === 'conflict').length;
  const rejectedCount = pendingOperations.filter((operation) => operation.state === 'rejected').length;
  const hasLastSyncError = Boolean(metadata.lastSyncError);

  if (hasLastSyncError) {
    return {
      tone: 'alert',
      headline: 'Sync failed — work is queued locally',
      detail: metadata.lastSyncError ?? undefined,
      pendingCount,
      conflictCount,
      rejectedCount,
      hasLastSyncError
    };
  }

  if (conflictCount > 0 || rejectedCount > 0) {
    return {
      tone: 'alert',
      headline: buildReviewHeadline(conflictCount, rejectedCount),
      pendingCount,
      conflictCount,
      rejectedCount,
      hasLastSyncError
    };
  }

  if (pendingCount > 0) {
    return {
      tone: 'attention',
      headline: `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} waiting to sync`,
      pendingCount,
      conflictCount,
      rejectedCount,
      hasLastSyncError
    };
  }

  if (!metadata.lastSuccessfulSyncAt) {
    return {
      tone: 'alert',
      headline: 'Not synced yet on this device',
      detail: 'BellField needs at least one successful sync before field work is protected on the server.',
      pendingCount,
      conflictCount,
      rejectedCount,
      hasLastSyncError
    };
  }

  return {
    tone: 'quiet',
    headline: 'Synced',
    pendingCount,
    conflictCount,
    rejectedCount,
    hasLastSyncError
  };
}

function buildReviewHeadline(conflictCount: number, rejectedCount: number): string {
  const conflictPhrase =
    conflictCount === 1 ? '1 conflict' : conflictCount > 1 ? `${conflictCount} conflicts` : null;
  const rejectedPhrase =
    rejectedCount === 1
      ? '1 rejected item'
      : rejectedCount > 1
        ? `${rejectedCount} rejected items`
        : null;

  if (conflictPhrase && rejectedPhrase) {
    const totalCount = conflictCount + rejectedCount;
    return `${conflictPhrase} and ${rejectedPhrase} ${totalCount === 1 ? 'needs' : 'need'} office review`;
  }

  if (conflictPhrase) {
    return `${conflictPhrase} ${conflictCount === 1 ? 'needs' : 'need'} office review`;
  }

  return `${rejectedPhrase} ${rejectedCount === 1 ? 'needs' : 'need'} office review`;
}
