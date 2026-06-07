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
type FieldAppointment = FieldJob['appointments'][number];

export type FieldReplacementEquipmentOption = {
  detail: string;
  id: string;
  label: string;
};

export type JobQueueBadge = {
  count: number;
  label: string;
  tone: 'quiet' | 'attention' | 'alert';
};

export type FieldJobCardMetadata = {
  locationLine: string;
  scheduleLabel: string;
  summaryLine: string;
  title: string;
};

export function buildFieldMediaCaptionDraftKey(input: {
  jobId: string;
  appointmentId?: string;
}): string {
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

export function sortFieldJobsBySchedule(jobs: FieldJob[], currentEmployeeId: string): FieldJob[] {
  return [...jobs].sort((left, right) => {
    const leftAppointment = selectFieldTimelineAppointment(left, currentEmployeeId);
    const rightAppointment = selectFieldTimelineAppointment(right, currentEmployeeId);
    const scheduleCompare = buildAppointmentSortKey(leftAppointment).localeCompare(
      buildAppointmentSortKey(rightAppointment)
    );

    if (scheduleCompare !== 0) {
      return scheduleCompare;
    }

    return left.jobNumber.localeCompare(right.jobNumber, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

export function formatFieldJobCardScheduleLabel(job: FieldJob, currentEmployeeId: string): string {
  const appointment = selectFieldTimelineAppointment(job, currentEmployeeId);

  if (!appointment) {
    return 'Unscheduled';
  }

  const dateLabel = appointment.scheduledDate || 'Unscheduled';
  const structuredTime = formatStructuredTime(appointment);

  if (structuredTime) {
    return `${dateLabel} - ${structuredTime}`;
  }

  if (appointment.timeWindowLabel) {
    return `${dateLabel} - ${appointment.timeWindowLabel}`;
  }

  return dateLabel;
}

export function buildFieldJobCardMetadata(input: {
  currentEmployeeId: string;
  job: FieldJob;
  locationAddress: string;
  locationName: string;
}): FieldJobCardMetadata {
  return {
    locationLine: `${input.locationName} - ${input.locationAddress}`,
    scheduleLabel: formatFieldJobCardScheduleLabel(input.job, input.currentEmployeeId),
    summaryLine: input.job.summary,
    title: `Job ${input.job.jobNumber}`
  };
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

export function buildReplacementEquipmentOptions(
  record: FieldEquipmentRecord,
  equipment: FieldEquipmentRecord[]
): FieldReplacementEquipmentOption[] {
  if (
    record.status === 'removed' ||
    record.status === 'pendingInstall' ||
    record.replacedByEquipmentId
  ) {
    return [];
  }

  return equipment
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        candidate.status === 'pendingInstall' &&
        !candidate.replacesEquipmentId &&
        !candidate.replacedByEquipmentId &&
        candidate.locationId === record.locationId &&
        candidate.inventoryLocationLabel === record.inventoryLocationLabel
    )
    .map((candidate) => ({
      detail: formatReplacementEquipmentDetail(candidate),
      id: candidate.id,
      label: formatReplacementEquipmentLabel(candidate)
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatReplacementEquipmentLabel(record: FieldEquipmentRecord): string {
  const brandModel = [record.brand, record.model].filter(Boolean).join(' ');
  return [record.equipmentType, brandModel].filter(Boolean).join(': ');
}

function formatReplacementEquipmentDetail(record: FieldEquipmentRecord): string {
  const detailParts = [
    record.serialNumber ? `Serial: ${record.serialNumber}` : 'No serial recorded',
    record.equipmentLocationDescription
      ? `Location: ${record.equipmentLocationDescription}`
      : undefined,
    record.status !== 'active' ? `Status: ${record.status}` : undefined
  ].filter((entry): entry is string => Boolean(entry));

  return detailParts.join(' - ');
}

export function selectFieldTimelineAppointment(
  job: FieldJob,
  currentEmployeeId: string
): FieldAppointment | undefined {
  const currentTechnicianAppointments = job.appointments.filter(
    (appointment) =>
      appointment.technicianId === currentEmployeeId && appointment.status !== 'cancelled'
  );

  if (currentTechnicianAppointments.length > 0) {
    return sortAppointments(currentTechnicianAppointments)[0];
  }

  const activeAppointments = job.appointments.filter(
    (appointment) => appointment.status !== 'cancelled'
  );

  return sortAppointments(activeAppointments.length > 0 ? activeAppointments : job.appointments)[0];
}

function sortAppointments(appointments: FieldAppointment[]): FieldAppointment[] {
  return [...appointments].sort((left, right) =>
    buildAppointmentSortKey(left).localeCompare(buildAppointmentSortKey(right))
  );
}

function buildAppointmentSortKey(appointment: FieldAppointment | undefined): string {
  if (!appointment) {
    return '9999-12-31|99:99|zzzzzz';
  }

  return [
    appointment.scheduledDate || '9999-12-31',
    appointment.scheduledStartTime || '99:99',
    appointment.scheduledEndTime || '99:99',
    appointment.timeWindowLabel || 'zzzzzz',
    appointment.createdAt
  ].join('|');
}

function formatStructuredTime(appointment: FieldAppointment): string | undefined {
  if (appointment.scheduledStartTime && appointment.scheduledEndTime) {
    return `${appointment.scheduledStartTime}-${appointment.scheduledEndTime}`;
  }

  return appointment.scheduledStartTime ?? appointment.scheduledEndTime;
}
