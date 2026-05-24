import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import type { PendingOperation } from './field-sync-types';

export const fieldDetailTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'register', label: 'Register' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'sync', label: 'Sync' }
] as const;

export type FieldDetailTab = (typeof fieldDetailTabs)[number]['id'];
export type FieldJob = FieldAssignedWorkResponse['jobs'][number];
export type FieldEquipmentRecord = FieldAssignedWorkResponse['equipment'][number];

export type JobQueueBadge = {
  count: number;
  label: string;
  tone: 'quiet' | 'attention' | 'alert';
};

export function buildFieldMediaCaptionDraftKey(input: { jobId: string; appointmentId?: string }): string {
  return input.appointmentId ? `appointment:${input.appointmentId}` : `job:${input.jobId}`;
}

export function resolveSelectedFieldJob(
  jobs: FieldJob[],
  selectedJobId: string | null
): FieldJob | null {
  if (!selectedJobId) {
    return null;
  }

  return jobs.find((job) => job.id === selectedJobId) ?? null;
}

export function shouldReturnToFieldHome(jobs: FieldJob[], selectedJobId: string | null): boolean {
  return Boolean(selectedJobId && !resolveSelectedFieldJob(jobs, selectedJobId));
}

export function getPendingOperationsForJob(
  job: FieldJob,
  equipment: FieldEquipmentRecord[],
  pendingOperations: PendingOperation[]
): PendingOperation[] {
  const appointmentIds = new Set(job.appointments.map((appointment) => appointment.id));
  const equipmentIds = new Set(equipment.map((record) => record.id));

  return pendingOperations.filter((operation) => {
    if (
      operation.kind === 'jobNote' ||
      operation.kind === 'registerEntryCreate' ||
      operation.kind === 'registerEntryEdit' ||
      operation.kind === 'registerEntryVoid' ||
      operation.kind === 'mediaUpload'
    ) {
      return operation.jobId === job.id;
    }

    if (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') {
      return appointmentIds.has(operation.appointmentId);
    }

    return equipmentIds.has(operation.equipmentId);
  });
}

export function summarizeJobQueueBadge(
  job: FieldJob,
  equipment: FieldEquipmentRecord[],
  pendingOperations: PendingOperation[]
): JobQueueBadge {
  const jobOperations = getPendingOperationsForJob(job, equipment, pendingOperations);
  const conflictedOrRejectedCount = jobOperations.filter(
    (operation) => operation.state === 'conflict' || operation.state === 'rejected'
  ).length;
  const pendingCount = jobOperations.filter((operation) => operation.state === 'pending').length;

  if (conflictedOrRejectedCount > 0) {
    return {
      count: conflictedOrRejectedCount,
      label: `${conflictedOrRejectedCount} needs review`,
      tone: 'alert'
    };
  }

  if (pendingCount > 0) {
    return {
      count: pendingCount,
      label: `${pendingCount} queued`,
      tone: 'attention'
    };
  }

  return {
    count: 0,
    label: 'Synced',
    tone: 'quiet'
  };
}

export function countJobRegisterEntries(job: FieldJob): number {
  return (job.registerEntries ?? []).filter((entry) => !entry.isVoid).length;
}
