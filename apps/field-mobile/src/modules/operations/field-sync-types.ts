import type { AppointmentStatus, EquipmentStatus, FieldAssignedWorkResponse, SyncResult } from '@/lib/operations-api';

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
