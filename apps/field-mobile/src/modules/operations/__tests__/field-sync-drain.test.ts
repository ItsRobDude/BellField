import { describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import { drainFieldSyncQueue } from '../field-sync-drain';
import type { PendingOperation, SyncMetadata } from '../field-sync-types';

vi.mock('@/lib/operations-api', () => ({
  addFieldJobNote: vi.fn(),
  createFieldMediaUploadIntent: vi.fn(),
  createFieldRegisterEntry: vi.fn(),
  getAssignedFieldWork: vi.fn(),
  isFieldSessionAccessLostError: vi.fn(),
  isFieldSessionExpiredError: vi.fn(),
  updateFieldAppointmentStatus: vi.fn(),
  updateFieldEquipment: vi.fn(),
  updateFieldRegisterEntry: vi.fn(),
  voidFieldRegisterEntry: vi.fn()
}));

vi.mock('../field-sync-store', () => ({
  removePendingOperation: vi.fn(),
  saveAssignedWorkSnapshot: vi.fn(),
  saveSyncMetadata: vi.fn(),
  updatePendingOperationState: vi.fn()
}));

vi.mock('../field-media-capture', () => ({
  deleteStagedFieldMedia: vi.fn()
}));

vi.mock('../field-media-replay', () => ({
  replayFieldMediaUploadOperation: vi.fn()
}));

vi.mock('../field-media-upload', () => ({
  uploadFieldMediaBlob: vi.fn()
}));

const defaultSyncMetadata: SyncMetadata = {
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastSnapshotVersion: null,
  lastSyncError: null
};

const assignedWorkSnapshot = {
  jobs: [],
  locations: [],
  customers: [],
  equipment: [],
  catalogItems: [],
  agreementCoverage: [],
  serverTime: '2026-05-23T12:00:00.000Z',
  snapshotVersion: 'snapshot-1',
  windowStartDate: '2026-05-23',
  windowEndDate: '2026-05-24'
};

describe('drainFieldSyncQueue session handling', () => {
  it('returns to sign-in on session expiry without clearing pending operations', async () => {
    const error = new Error('Session expired. Please sign in again.');
    vi.mocked(operationsApi.getAssignedFieldWork).mockRejectedValue(error);
    vi.mocked(operationsApi.isFieldSessionExpiredError).mockReturnValue(true);
    vi.mocked(operationsApi.isFieldSessionAccessLostError).mockReturnValue(false);

    const onSessionExpired = vi.fn();
    const onSessionAccessLost = vi.fn();
    const setPendingOperations = vi.fn();

    const result = await drainFieldSyncQueue(
      {
        sessionToken: 'session-token',
        apiBaseUrl: 'http://server.local',
        ownerEmployeeId: 'tech-1',
        syncMetadata: defaultSyncMetadata,
        pendingOperations: [{ id: 'pending-1' } as PendingOperation],
        setServerSnapshot: vi.fn(),
        setSyncMetadata: vi.fn(),
        setPendingOperations,
        setErrorMessage: vi.fn(),
        onSessionExpired,
        onSessionAccessLost
      },
      { visible: true }
    );

    expect(result).toEqual({ ok: false });
    expect(onSessionExpired).toHaveBeenCalledWith('Session expired. Please sign in again.');
    expect(onSessionAccessLost).not.toHaveBeenCalled();
    expect(setPendingOperations).not.toHaveBeenCalled();
  });

  it('does not replay an operation owned by a different employee', async () => {
    vi.mocked(operationsApi.getAssignedFieldWork).mockResolvedValue(assignedWorkSnapshot);
    vi.mocked(operationsApi.isFieldSessionExpiredError).mockReturnValue(false);
    vi.mocked(operationsApi.isFieldSessionAccessLostError).mockReturnValue(false);

    const result = await drainFieldSyncQueue(
      {
        sessionToken: 'session-token',
        apiBaseUrl: 'http://server.local',
        ownerEmployeeId: 'tech-b',
        syncMetadata: defaultSyncMetadata,
        pendingOperations: [
          {
            id: 'note-1',
            ownerEmployeeId: 'tech-a',
            kind: 'jobNote',
            jobId: 'job-1',
            note: 'A local note',
            occurredAt: '2026-05-23T12:00:00.000Z',
            state: 'pending'
          }
        ],
        setServerSnapshot: vi.fn(),
        setSyncMetadata: vi.fn(),
        setPendingOperations: vi.fn(),
        setErrorMessage: vi.fn()
      },
      { visible: true }
    );

    expect(result).toEqual({ ok: true });
    expect(operationsApi.addFieldJobNote).not.toHaveBeenCalled();
  });
});
