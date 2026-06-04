import { Alert } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';
import {
  createFieldEquipment,
  linkFieldEquipmentReplacement,
  type AppointmentStatus,
  type FieldAssignedWorkResponse
} from '@/lib/operations-api';
import {
  queuePendingOperation,
  removePendingOperation,
  updatePendingOperationState
} from './field-sync-store';
import type { AssignedWorkSnapshot, PendingOperation } from './field-sync-types';
import {
  findAppointmentBaseUpdatedAt,
  findEquipmentBaseUpdatedAt,
  findJobBaseUpdatedAt,
  findRegisterEntryBaseUpdatedAt
} from './field-pending-replay';
import {
  discardPendingOperation as discardPendingOperationFromQueue,
  markPendingOperationForRetry
} from './field-queue-resolution';
import { pickFieldMedia, type FieldMediaSource } from './field-media-capture';
import { buildMediaUploadOperation } from './field-media-files';
import {
  parseRegisterEntryDraft,
  type EquipmentCreateDraft,
  type EquipmentDraft,
  type FinishReviewState,
  type RegisterEntryDraft
} from './field-workspace-drafts';

// Dependencies the operation handlers close over. The screen owns the state; this factory keeps
// the offline-queue handlers (build PendingOperation -> persist -> update state) out of the
// component body. Each call returns fresh closures over the current deps, exactly as the inline
// handlers did each render.
export type FieldOperationHandlerDeps = {
  sessionToken: string;
  apiBaseUrl: string;
  serverSnapshot: AssignedWorkSnapshot | null;
  setPendingOperations: Dispatch<SetStateAction<PendingOperation[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  refreshAssignedWork: (showSpinner?: boolean, metadataOverride?: never) => Promise<void>;
};

export function createFieldOperationHandlers(deps: FieldOperationHandlerDeps) {
  const {
    sessionToken,
    apiBaseUrl,
    serverSnapshot,
    setPendingOperations,
    setErrorMessage,
    refreshAssignedWork
  } = deps;

  async function queueJobNote(jobId: string, noteDraft: string): Promise<boolean> {
    const note = noteDraft.trim();

    if (!note) {
      return false;
    }

    const operation: PendingOperation = {
      id: `${jobId}-note-${Date.now()}`,
      kind: 'jobNote',
      jobId,
      note,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, jobId),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the note locally.');
      return false;
    }
  }

  async function queueMediaUpload(
    job: FieldAssignedWorkResponse['jobs'][number],
    source: FieldMediaSource,
    appointmentId: string | undefined,
    captionDraft: string | undefined
  ): Promise<boolean> {
    setErrorMessage(null);

    try {
      const stagedMedia = await pickFieldMedia(source);

      if (!stagedMedia) {
        return false;
      }

      const caption = captionDraft?.trim();
      const operation = buildMediaUploadOperation({
        jobId: job.id,
        appointmentId,
        stagedMedia,
        caption,
        baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, job.id)
      });

      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue media locally.');
      return false;
    }
  }

  async function queueRegisterEntryCreate(
    job: FieldAssignedWorkResponse['jobs'][number],
    draft: RegisterEntryDraft
  ): Promise<boolean> {
    const parsed = parseRegisterEntryDraft(draft, false);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return false;
    }

    const operation: PendingOperation = {
      id: `${job.id}-register-${Date.now()}`,
      kind: 'registerEntryCreate',
      jobId: job.id,
      appointmentId: draft.appointmentId || undefined,
      registerEntryKind: draft.registerEntryKind,
      description: parsed.value.description,
      quantity: parsed.value.quantity,
      unitOfMeasure: parsed.value.unitOfMeasure,
      unitPrice: parsed.value.unitPrice ?? undefined,
      totalAmount: parsed.value.totalAmount,
      partNumber: parsed.value.partNumber,
      inventorySourceLabel: parsed.value.inventorySourceLabel,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, job.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the register entry locally.'
      );
      return false;
    }
  }

  async function queueRegisterEntryEdit(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number],
    draft: RegisterEntryDraft
  ): Promise<boolean> {
    const parsed = parseRegisterEntryDraft(draft, true);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return false;
    }

    const operation: PendingOperation = {
      id: `${entry.id}-register-edit-${Date.now()}`,
      kind: 'registerEntryEdit',
      jobId: entry.jobId,
      registerEntryId: entry.id,
      appointmentId: draft.appointmentId || null,
      registerEntryKind: draft.registerEntryKind,
      description: parsed.value.description,
      quantity: parsed.value.quantity,
      unitOfMeasure: parsed.value.unitOfMeasure,
      unitPrice: parsed.value.unitPrice,
      totalAmount: parsed.value.totalAmount,
      partNumber: parsed.value.partNumber,
      inventorySourceLabel: parsed.value.inventorySourceLabel,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findRegisterEntryBaseUpdatedAt(serverSnapshot, entry.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [
        ...current.filter(
          (pendingOperation) =>
            !(
              (pendingOperation.kind === 'registerEntryEdit' ||
                pendingOperation.kind === 'registerEntryVoid') &&
              pendingOperation.registerEntryId === entry.id
            )
        ),
        operation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the register edit locally.'
      );
      return false;
    }
  }

  function confirmVoidRegisterEntry(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    Alert.alert(
      'Void register entry?',
      'This keeps the line in job history and queues a void for office sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void locally',
          style: 'destructive',
          onPress: () => {
            void queueRegisterEntryVoid(entry);
          }
        }
      ]
    );
  }

  async function queueRegisterEntryVoid(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    const operation: PendingOperation = {
      id: `${entry.id}-register-void-${Date.now()}`,
      kind: 'registerEntryVoid',
      jobId: entry.jobId,
      registerEntryId: entry.id,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findRegisterEntryBaseUpdatedAt(serverSnapshot, entry.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [
        ...current.filter(
          (pendingOperation) =>
            !(
              (pendingOperation.kind === 'registerEntryEdit' ||
                pendingOperation.kind === 'registerEntryVoid') &&
              pendingOperation.registerEntryId === entry.id
            )
        ),
        operation
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to void the register entry locally.'
      );
    }
  }

  async function queueAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<boolean> {
    const baseUpdatedAt = findAppointmentBaseUpdatedAt(serverSnapshot, appointmentId);
    const nextOperation: PendingOperation = {
      id: `${appointmentId}-status-${Date.now()}`,
      kind: 'appointmentStatus',
      appointmentId,
      status,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt,
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(
              (operation.kind === 'appointmentStatus' ||
                operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === appointmentId
            )
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the appointment status locally.'
      );
      return false;
    }
  }

  async function queueAppointmentFinishReview(
    currentFinishReview: FinishReviewState
  ): Promise<boolean> {
    const baseUpdatedAt = findAppointmentBaseUpdatedAt(
      serverSnapshot,
      currentFinishReview.appointmentId
    );
    const nextOperation: PendingOperation = {
      id: `${currentFinishReview.appointmentId}-finish-${Date.now()}`,
      kind: 'appointmentFinishReview',
      appointmentId: currentFinishReview.appointmentId,
      status: 'finished',
      finishOutcome: currentFinishReview.finishOutcome,
      visitNotes: currentFinishReview.visitNotes.trim() || undefined,
      hasChargeActivity: currentFinishReview.hasChargeActivity,
      registerFollowUpNote: currentFinishReview.registerReminder.trim() || undefined,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt,
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(
              (operation.kind === 'appointmentStatus' ||
                operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === currentFinishReview.appointmentId
            )
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the finish review locally.'
      );
      return false;
    }
  }

  async function queueEquipmentUpdate(
    record: FieldAssignedWorkResponse['equipment'][number],
    draft: EquipmentDraft
  ): Promise<boolean> {
    const nextOperation: PendingOperation = {
      id: `${record.id}-equipment-${Date.now()}`,
      kind: 'equipmentUpdate',
      equipmentId: record.id,
      model: draft.model.trim(),
      serialNumber: draft.serialNumber.trim(),
      filterSizes: draft.filterSizes
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      equipmentLocationDescription: draft.equipmentLocationDescription.trim() || undefined,
      installDate: draft.installDate.trim() || undefined,
      status: draft.status,
      notes: draft.notes.trim(),
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findEquipmentBaseUpdatedAt(serverSnapshot, record.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(operation.kind === 'equipmentUpdate' && operation.equipmentId === record.id)
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the equipment change locally.'
      );
      return false;
    }
  }

  async function createEquipmentAtLocation(
    locationId: string,
    draft: EquipmentCreateDraft
  ): Promise<boolean> {
    try {
      await createFieldEquipment({
        sessionToken,
        apiBaseUrl,
        locationId,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: draft.filterSizes
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
        equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
        installDate: draft.installDate || undefined,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        status: draft.status,
        notes: draft.notes || undefined
      });
      await refreshAssignedWork(false);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended')
      ) {
        Alert.alert(
          'Create without serial?',
          'Serial number is blank. Create this equipment record anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Create',
              onPress: () => {
                void createFieldEquipment({
                  sessionToken,
                  apiBaseUrl,
                  locationId,
                  equipmentType: draft.equipmentType,
                  brand: draft.brand,
                  model: draft.model,
                  serialNumber: draft.serialNumber,
                  filterSizes: draft.filterSizes
                    .split(',')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0),
                  equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
                  installDate: draft.installDate || undefined,
                  warrantyStartDate: draft.warrantyStartDate || undefined,
                  warrantyEndDate: draft.warrantyEndDate || undefined,
                  warrantyProviderNote: draft.warrantyProviderNote || undefined,
                  systemGroupName: draft.systemGroupName || undefined,
                  status: draft.status,
                  notes: draft.notes || undefined,
                  confirmMissingSerial: true
                })
                  .then(() => refreshAssignedWork(false))
                  .catch((createError) => {
                    setErrorMessage(
                      createError instanceof Error
                        ? createError.message
                        : 'Unable to create equipment.'
                    );
                  });
              }
            }
          ]
        );
        return false;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to create equipment.');
      return false;
    }
  }

  async function linkReplacement(
    recordId: string,
    replacementEquipmentId: string
  ): Promise<boolean> {
    try {
      await linkFieldEquipmentReplacement({
        equipmentId: recordId,
        replacementEquipmentId,
        sessionToken,
        apiBaseUrl
      });
      await refreshAssignedWork(false);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to link replacement equipment.'
      );
      return false;
    }
  }

  async function retryQueuedOperation(operationId: string) {
    setErrorMessage(null);

    try {
      await updatePendingOperationState(operationId, 'pending');
      setPendingOperations((current) => markPendingOperationForRetry(current, operationId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to mark the local change for retry.'
      );
    }
  }

  function confirmDiscardQueuedOperation(operation: PendingOperation) {
    Alert.alert(
      'Discard local change?',
      'This removes the saved local change from this device and it will not sync to the office.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void discardQueuedOperation(operation.id);
          }
        }
      ]
    );
  }

  async function discardQueuedOperation(operationId: string) {
    setErrorMessage(null);

    try {
      await removePendingOperation(operationId);
      setPendingOperations((current) => discardPendingOperationFromQueue(current, operationId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to discard the local change.'
      );
    }
  }

  return {
    queueJobNote,
    queueMediaUpload,
    queueRegisterEntryCreate,
    queueRegisterEntryEdit,
    confirmVoidRegisterEntry,
    queueAppointmentStatus,
    queueAppointmentFinishReview,
    queueEquipmentUpdate,
    createEquipmentAtLocation,
    linkReplacement,
    retryQueuedOperation,
    confirmDiscardQueuedOperation
  };
}
