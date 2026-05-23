import type {
  AppointmentFinishOutcome,
  EquipmentMutationResponse,
  FieldAssignedWorkResponse,
  JobMutationResponse
} from '@/lib/operations-api';
import type { AssignedWorkSnapshot, PendingOperation } from './field-sync-types';

export function applyPendingOperations(
  snapshot: AssignedWorkSnapshot | null,
  pendingOperations: PendingOperation[],
  actorName: string
): FieldAssignedWorkResponse | null {
  if (!snapshot) {
    return null;
  }

  let nextSnapshot: FieldAssignedWorkResponse = {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => ({
      ...job,
      appointments: job.appointments.map((appointment) => ({ ...appointment })),
      timeline: job.timeline.map((entry) => ({ ...entry }))
    })),
    locations: snapshot.locations.map((location) => ({
      ...location,
      contacts: location.contacts.map((contact) => ({ ...contact }))
    })),
    customers: snapshot.customers.map((customer) => ({ ...customer })),
    equipment: snapshot.equipment.map((record) => ({ ...record }))
  };

  for (const operation of pendingOperations) {
    if (operation.kind === 'jobNote') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: operation.note,
                    kind: 'jobNote'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'appointmentStatus') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) => ({
          ...job,
          appointments: job.appointments.map((appointment) =>
            appointment.id === operation.appointmentId ? { ...appointment, status: operation.status } : appointment
          )
        }))
      };
    }

    if (operation.kind === 'appointmentFinishReview') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) => ({
          ...job,
          needsOfficeReview:
            job.id === findJobIdForAppointment(nextSnapshot, operation.appointmentId) ? true : job.needsOfficeReview,
          appointments: job.appointments.map((appointment) =>
            appointment.id === operation.appointmentId
              ? {
                  ...appointment,
                  status: operation.status,
                  finishOutcome: operation.finishOutcome,
                  visitNotes: operation.visitNotes,
                  hasChargeActivity: operation.hasChargeActivity,
                  registerFollowUpNote: operation.registerFollowUpNote,
                  needsOfficeReview: true
                }
              : appointment
          ),
          timeline:
            job.id === findJobIdForAppointment(nextSnapshot, operation.appointmentId)
              ? [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-finish`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `Finish review saved locally with outcome ${formatFinishOutcome(operation.finishOutcome)}.`,
                    kind: 'appointmentFinishedReview'
                  }
                ]
              : job.timeline
        }))
      };
    }

    if (operation.kind === 'equipmentUpdate') {
      nextSnapshot = {
        ...nextSnapshot,
        equipment: nextSnapshot.equipment.map((record) =>
          record.id === operation.equipmentId
            ? {
                ...record,
                model: operation.model ?? record.model,
                serialNumber: operation.serialNumber ?? record.serialNumber,
                filterSizes: operation.filterSizes ?? record.filterSizes,
                equipmentLocationDescription:
                  operation.equipmentLocationDescription ?? record.equipmentLocationDescription,
                installDate: operation.installDate ?? record.installDate,
                status: operation.status,
                notes: operation.notes
              }
            : record
        )
      };
    }
  }

  return nextSnapshot;
}

export function mergeJobMutationIntoAssignedWork(
  snapshot: AssignedWorkSnapshot,
  response: JobMutationResponse
): AssignedWorkSnapshot {
  const { syncResult: _syncResult, warningMessages: _warningMessages, ...jobSummary } = response;
  const hasJob = snapshot.jobs.some((job) => job.id === jobSummary.id);

  if (!hasJob) {
    return snapshot;
  }

  return {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => (job.id === jobSummary.id ? jobSummary : job))
  };
}

export function mergeEquipmentMutationIntoAssignedWork(
  snapshot: AssignedWorkSnapshot,
  response: EquipmentMutationResponse
): AssignedWorkSnapshot {
  const {
    history: _history,
    replacedByEquipment: _replacedByEquipment,
    replacesEquipment: _replacesEquipment,
    ...equipmentSummary
  } = response.equipment;
  const hasEquipment = snapshot.equipment.some((record) => record.id === equipmentSummary.id);

  if (!hasEquipment) {
    return snapshot;
  }

  return {
    ...snapshot,
    equipment: snapshot.equipment.map((record) => (record.id === equipmentSummary.id ? equipmentSummary : record))
  };
}

export function findJobIdForAppointment(
  snapshot: FieldAssignedWorkResponse,
  appointmentId: string
): string | undefined {
  return snapshot.jobs.find((job) => job.appointments.some((appointment) => appointment.id === appointmentId))?.id;
}

export function findAppointmentBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  appointmentId: string
): string | undefined {
  return snapshot?.jobs.flatMap((job) => job.appointments).find((appointment) => appointment.id === appointmentId)
    ?.updatedAt;
}

export function findJobBaseUpdatedAt(snapshot: AssignedWorkSnapshot | null, jobId: string): string | undefined {
  return snapshot?.jobs.find((job) => job.id === jobId)?.updatedAt;
}

export function findEquipmentBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  equipmentId: string
): string | undefined {
  return snapshot?.equipment.find((record) => record.id === equipmentId)?.updatedAt;
}

export function formatFinishOutcome(value: AppointmentFinishOutcome): string {
  if (value === 'followUpNeeded') {
    return 'Follow-up needed';
  }

  if (value === 'noAccess') {
    return 'No access';
  }

  return 'Completed';
}

export function formatPendingOperation(operation: PendingOperation): string {
  const stateSuffix =
    operation.state === 'pending'
      ? 'pending sync'
      : operation.state === 'conflict'
        ? `conflict${operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''}`
        : `rejected${operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''}`;

  if (operation.kind === 'jobNote') {
    return `Job note saved locally at ${new Date(operation.occurredAt).toLocaleTimeString()} (${stateSuffix})`;
  }

  if (operation.kind === 'appointmentStatus') {
    return `Appointment status queued: ${operation.status} (${stateSuffix})`;
  }

  if (operation.kind === 'appointmentFinishReview') {
    return `Finish review queued: ${formatFinishOutcome(operation.finishOutcome)} (${stateSuffix})`;
  }

  return `Equipment update queued: ${operation.status} (${stateSuffix})`;
}
