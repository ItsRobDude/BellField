import { describe, expect, it } from 'vitest';
import type { PendingOperation } from '../field-sync-types';
import {
  discardPendingOperation,
  getReplayablePendingOperations,
  markPendingOperationForRetry,
  shouldOfferQueueResolution
} from '../field-queue-resolution';

const pending: PendingOperation = {
  id: 'op-pending',
  kind: 'jobNote',
  jobId: 'job-1',
  note: 'Saved locally.',
  occurredAt: '2026-05-22T10:10:00.000Z',
  state: 'pending'
};

const olderPending: PendingOperation = {
  ...pending,
  id: 'op-older',
  occurredAt: '2026-05-22T10:00:00.000Z'
};

const conflict: PendingOperation = {
  id: 'op-conflict',
  kind: 'appointmentStatus',
  appointmentId: 'appointment-1',
  status: 'working',
  occurredAt: '2026-05-22T10:05:00.000Z',
  state: 'conflict',
  lastResultMessage: 'Office changed this appointment first.'
};

const rejected: PendingOperation = {
  id: 'op-rejected',
  kind: 'equipmentUpdate',
  equipmentId: 'equipment-1',
  status: 'active',
  notes: 'Changed filter.',
  occurredAt: '2026-05-22T10:15:00.000Z',
  state: 'rejected',
  lastResultMessage: 'Equipment is locked.'
};

describe('field queue resolution helpers', () => {
  it('only offers resolution controls for conflict and rejected operations', () => {
    expect(shouldOfferQueueResolution(pending)).toBe(false);
    expect(shouldOfferQueueResolution(conflict)).toBe(true);
    expect(shouldOfferQueueResolution(rejected)).toBe(true);
  });

  it('replays only pending operations and preserves chronological order', () => {
    expect(getReplayablePendingOperations([pending, conflict, olderPending, rejected]).map((operation) => operation.id)).toEqual([
      'op-older',
      'op-pending'
    ]);
  });

  it('marks a conflicted or rejected operation for explicit retry', () => {
    expect(markPendingOperationForRetry([conflict], conflict.id)).toEqual([
      {
        ...conflict,
        state: 'pending',
        lastResultMessage: undefined
      }
    ]);
  });

  it('discards one local operation without touching the rest of the queue', () => {
    expect(discardPendingOperation([pending, conflict, rejected], conflict.id).map((operation) => operation.id)).toEqual([
      'op-pending',
      'op-rejected'
    ]);
  });
});
