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
});
