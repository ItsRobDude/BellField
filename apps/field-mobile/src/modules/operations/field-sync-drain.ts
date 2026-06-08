import type { Dispatch, SetStateAction } from 'react';
import {
  addFieldJobNote,
  createFieldMediaUploadIntent,
  createFieldRegisterEntry,
  getAssignedFieldWork,
  updateFieldAppointmentStatus,
  updateFieldEquipment,
  updateFieldRegisterEntry,
  voidFieldRegisterEntry
} from '@/lib/operations-api';
import {
  removePendingOperation,
  saveAssignedWorkSnapshot,
  saveSyncMetadata,
  updatePendingOperationState
} from './field-sync-store';
import type { AssignedWorkSnapshot, PendingOperation, SyncMetadata } from './field-sync-types';
import {
  mergeEquipmentMutationIntoAssignedWork,
  mergeJobMutationIntoAssignedWork
} from './field-pending-replay';
import { buildSuccessfulSyncMetadata } from './field-sync-status';
import { getReplayablePendingOperations } from './field-queue-resolution';
import { deleteStagedFieldMedia } from './field-media-capture';
import { replayFieldMediaUploadOperation } from './field-media-replay';
import { uploadFieldMediaBlob } from './field-media-upload';

// Snapshot of the state the drain reads at call time plus the React setters it writes through.
// The screen owns the state; this keeps the queue/replay business rules out of the component.
export type FieldSyncDrainContext = {
  sessionToken: string;
  apiBaseUrl: string;
  syncMetadata: SyncMetadata;
  pendingOperations: PendingOperation[];
  setServerSnapshot: Dispatch<SetStateAction<AssignedWorkSnapshot | null>>;
  setSyncMetadata: Dispatch<SetStateAction<SyncMetadata>>;
  setPendingOperations: Dispatch<SetStateAction<PendingOperation[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

// Internal drain orchestration. Called by both the manual Sync Now button and the background
// sync loop. Returns whether the drain finished cleanly so the background loop can update its
// backoff state. The caller owns the mutex (drainInFlightRef) and any visible spinner state;
// this function only touches the data path.
export async function drainFieldSyncQueue(
  ctx: FieldSyncDrainContext,
  options: { visible: boolean }
): Promise<{ ok: boolean }> {
  const {
    sessionToken,
    apiBaseUrl,
    syncMetadata,
    pendingOperations,
    setServerSnapshot,
    setSyncMetadata,
    setPendingOperations,
    setErrorMessage
  } = ctx;

  if (options.visible) {
    setErrorMessage(null);
  }

  const attemptedAt = new Date().toISOString();
  const attemptedMetadata: SyncMetadata = {
    ...syncMetadata,
    lastAttemptedSyncAt: attemptedAt,
    lastSyncError: null
  };

  await saveSyncMetadata(attemptedMetadata);
  setSyncMetadata(attemptedMetadata);

  try {
    const latestSnapshot = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
    await saveAssignedWorkSnapshot(latestSnapshot);
    setServerSnapshot(latestSnapshot);

    let currentServerSnapshot: AssignedWorkSnapshot = latestSnapshot;
    let shouldStopEarly = false;
    let hadSyncFailure = false;

    async function preserveAppliedOperation(
      operationId: string,
      nextSnapshot: AssignedWorkSnapshot
    ) {
      currentServerSnapshot = nextSnapshot;
      await saveAssignedWorkSnapshot(currentServerSnapshot);
      setServerSnapshot(currentServerSnapshot);
      await removePendingOperation(operationId);
      setPendingOperations((current) => current.filter((entry) => entry.id !== operationId));
    }

    for (const operation of getReplayablePendingOperations(pendingOperations)) {
      if (shouldStopEarly) {
        break;
      }

      try {
        if (operation.kind === 'jobNote') {
          const response = await addFieldJobNote({
            sessionToken,
            apiBaseUrl,
            jobId: operation.jobId,
            note: operation.note,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'appointmentStatus') {
          const response = await updateFieldAppointmentStatus({
            sessionToken,
            apiBaseUrl,
            appointmentId: operation.appointmentId,
            status: operation.status,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'appointmentFinishReview') {
          const response = await updateFieldAppointmentStatus({
            sessionToken,
            apiBaseUrl,
            appointmentId: operation.appointmentId,
            status: operation.status,
            finishOutcome: operation.finishOutcome,
            visitNotes: operation.visitNotes,
            hasChargeActivity: operation.hasChargeActivity,
            registerFollowUpNote: operation.registerFollowUpNote,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'registerEntryCreate') {
          const response = await createFieldRegisterEntry({
            sessionToken,
            apiBaseUrl,
            jobId: operation.jobId,
            appointmentId: operation.appointmentId,
            kind: operation.registerEntryKind,
            description: operation.description,
            quantity: operation.quantity,
            unitOfMeasure: operation.unitOfMeasure,
            unitPrice: operation.unitPrice,
            totalAmount: operation.totalAmount,
            partNumber: operation.partNumber,
            inventorySourceLabel: operation.inventorySourceLabel,
            inventoryItemId: operation.inventoryItemId,
            inventoryLocationId: operation.inventoryLocationId,
            catalogItemId: operation.catalogItemId,
            catalogSnapshot: operation.catalogSnapshot,
            // The queued operation's stable local id is the server idempotency key: a re-drain
            // after a lost response returns the original line instead of creating a duplicate.
            clientOperationId: operation.id,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'registerEntryEdit') {
          const response = await updateFieldRegisterEntry({
            sessionToken,
            apiBaseUrl,
            registerEntryId: operation.registerEntryId,
            appointmentId: operation.appointmentId,
            kind: operation.registerEntryKind,
            description: operation.description,
            quantity: operation.quantity,
            unitOfMeasure: operation.unitOfMeasure,
            unitPrice: operation.unitPrice,
            totalAmount: operation.totalAmount,
            partNumber: operation.partNumber,
            inventorySourceLabel: operation.inventorySourceLabel,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'registerEntryVoid') {
          const response = await voidFieldRegisterEntry({
            sessionToken,
            apiBaseUrl,
            registerEntryId: operation.registerEntryId,
            reason: operation.reason,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }

        if (operation.kind === 'mediaUpload') {
          const response = await replayFieldMediaUploadOperation(operation, {
            createUploadIntent: (mediaOperation) =>
              createFieldMediaUploadIntent({
                sessionToken,
                apiBaseUrl,
                jobId: mediaOperation.jobId,
                appointmentId: mediaOperation.appointmentId,
                kind: mediaOperation.mediaKind,
                contentType: mediaOperation.contentType,
                byteSize: mediaOperation.byteSize,
                sha256: mediaOperation.sha256,
                originalFilename: mediaOperation.originalFilename,
                caption: mediaOperation.caption,
                capturedAt: mediaOperation.capturedAt
              }),
            uploadBlob: ({ mediaId, uploadToken, localUri }) =>
              uploadFieldMediaBlob({
                apiBaseUrl,
                mediaId,
                uploadToken,
                localUri
              })
          });

          if (response.status === 'rejected') {
            await updatePendingOperationState(operation.id, 'rejected', response.message);
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? { ...entry, state: 'rejected', lastResultMessage: response.message }
                  : entry
              )
            );
            continue;
          }

          await preserveAppliedOperation(operation.id, currentServerSnapshot);
          await deleteStagedFieldMedia(operation.localUri).catch(() => undefined);
        }

        if (operation.kind === 'equipmentUpdate') {
          const response = await updateFieldEquipment({
            sessionToken,
            apiBaseUrl,
            equipmentId: operation.equipmentId,
            model: operation.model,
            serialNumber: operation.serialNumber,
            filterSizes: operation.filterSizes,
            equipmentLocationDescription: operation.equipmentLocationDescription,
            installDate: operation.installDate,
            status: operation.status,
            notes: operation.notes,
            occurredAt: operation.occurredAt,
            baseUpdatedAt: operation.baseUpdatedAt
          });

          if (response.syncResult?.status === 'conflict') {
            await updatePendingOperationState(
              operation.id,
              'conflict',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'conflict',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else if (response.syncResult?.status === 'rejected') {
            await updatePendingOperationState(
              operation.id,
              'rejected',
              response.syncResult.message
            );
            setPendingOperations((current) =>
              current.map((entry) =>
                entry.id === operation.id
                  ? {
                      ...entry,
                      state: 'rejected',
                      lastResultMessage: response.syncResult?.message
                    }
                  : entry
              )
            );
          } else {
            await preserveAppliedOperation(
              operation.id,
              mergeEquipmentMutationIntoAssignedWork(currentServerSnapshot, response)
            );
          }
        }
      } catch (error) {
        const nextErrorMessage =
          error instanceof Error ? error.message : 'Unable to sync queued field work.';
        const failedMetadata: SyncMetadata = {
          ...attemptedMetadata,
          lastSyncError: nextErrorMessage
        };

        await saveSyncMetadata(failedMetadata);
        setSyncMetadata(failedMetadata);
        setErrorMessage(nextErrorMessage);
        hadSyncFailure = true;
        shouldStopEarly = true;
      }
    }

    if (hadSyncFailure) {
      return { ok: false };
    }

    const refreshedSnapshot = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
    const nextSyncMetadata = buildSuccessfulSyncMetadata(
      attemptedMetadata,
      refreshedSnapshot.snapshotVersion,
      new Date().toISOString(),
      attemptedAt
    );

    await saveAssignedWorkSnapshot(refreshedSnapshot);
    await saveSyncMetadata(nextSyncMetadata);
    setServerSnapshot(refreshedSnapshot);
    setSyncMetadata(nextSyncMetadata);
    return { ok: true };
  } catch (error) {
    const nextErrorMessage =
      error instanceof Error ? error.message : 'Unable to sync queued field work.';
    const failedMetadata: SyncMetadata = {
      ...attemptedMetadata,
      lastSyncError: nextErrorMessage
    };

    await saveSyncMetadata(failedMetadata);
    setSyncMetadata(failedMetadata);
    // Surface a visible error message only when the drain was user-initiated.
    // Background failures stay quiet; the sync indicator card already
    // flips to alert tone via lastSyncError so the technician can see it.
    if (options.visible) {
      setErrorMessage(nextErrorMessage);
    }
    return { ok: false };
  }
}
