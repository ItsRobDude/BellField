import type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  FieldTruckStockResponse,
  MediaAttachmentKind,
  RegisterEntryKind,
  SyncResult
} from '@/lib/operations-api';

export type PendingOperationState = 'pending' | 'conflict' | 'rejected';

type PendingOperationBase = {
  id: string;
  occurredAt: string;
  state: PendingOperationState;
  lastResultMessage?: string;
};

export type PendingOperation =
  | (PendingOperationBase & {
      kind: 'jobNote';
      jobId: string;
      note: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'appointmentStatus';
      appointmentId: string;
      status: AppointmentStatus;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'appointmentFinishReview';
      appointmentId: string;
      status: 'finished';
      finishOutcome: AppointmentFinishOutcome;
      visitNotes?: string;
      hasChargeActivity: boolean;
      registerFollowUpNote?: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'registerEntryCreate';
      jobId: string;
      appointmentId?: string;
      registerEntryKind: RegisterEntryKind;
      description: string;
      quantity: number;
      unitOfMeasure?: string;
      unitPrice?: number;
      totalAmount: number;
      partNumber?: string;
      inventorySourceLabel?: string;
      inventoryItemId?: string;
      inventoryLocationId?: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'registerEntryEdit';
      jobId: string;
      registerEntryId: string;
      appointmentId?: string | null;
      registerEntryKind?: RegisterEntryKind;
      description?: string;
      quantity?: number;
      unitOfMeasure?: string;
      unitPrice?: number | null;
      totalAmount?: number;
      partNumber?: string;
      inventorySourceLabel?: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'registerEntryVoid';
      jobId: string;
      registerEntryId: string;
      reason?: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'mediaUpload';
      jobId: string;
      appointmentId?: string;
      localMediaId: string;
      localUri: string;
      originalFilename: string;
      mediaKind: MediaAttachmentKind;
      contentType: string;
      byteSize: number;
      sha256: string;
      caption?: string;
      capturedAt: string;
      baseUpdatedAt?: string;
    })
  | (PendingOperationBase & {
      kind: 'equipmentUpdate';
      equipmentId: string;
      model?: string;
      serialNumber?: string;
      filterSizes?: string[];
      equipmentLocationDescription?: string;
      installDate?: string;
      status: EquipmentStatus;
      notes: string;
      baseUpdatedAt?: string;
    });

export type AssignedWorkSnapshot = FieldAssignedWorkResponse;

/** The technician's cached truck-stock snapshot (Slice 1b part-add picker). */
export type TruckStockSnapshot = FieldTruckStockResponse;

export type SyncMetadata = {
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastSnapshotVersion: string | null;
  lastSyncError: string | null;
};

export type SyncOperationOutcome = {
  operationId: string;
  syncResult: SyncResult;
};
