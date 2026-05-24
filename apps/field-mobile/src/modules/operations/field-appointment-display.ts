import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import type { PendingOperation } from './field-sync-types';

type FieldJob = FieldAssignedWorkResponse['jobs'][number];
type FieldAppointment = FieldJob['appointments'][number];
type FieldLocation = FieldAssignedWorkResponse['locations'][number];
type FinishedReviewDecision = NonNullable<FieldAppointment['finishedReviewDecision']>;

export type AppointmentQueueSummary = {
  label: string;
  tone: 'attention' | 'alert';
};

const finishedReviewDecisionLabels: Record<FinishedReviewDecision, string> = {
  keptOpen: 'Office kept this job open',
  followUpScheduled: 'Office scheduled follow-up'
};

export function formatFieldLocationAddress(location: FieldLocation | undefined): string {
  if (!location) {
    return 'Unknown location address';
  }

  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const cityStatePostal = [cityState, location.postalCode].filter(Boolean).join(' ');
  return [location.addressLine1, cityStatePostal].filter(Boolean).join(', ');
}

export function formatWorkOrderLine(job: Pick<FieldJob, 'workOrderNumber'>): string | undefined {
  if (!job.workOrderNumber) {
    return undefined;
  }

  return `Work order: ${job.workOrderNumber}`;
}

export function formatAppointmentSchedule(appointment: FieldAppointment): string {
  const dateLabel = appointment.scheduledDate || 'Unscheduled';
  const structuredTime = formatStructuredTime(appointment);

  if (structuredTime) {
    return `${dateLabel} - ${structuredTime}`;
  }

  return `${dateLabel} - ${appointment.timeWindowLabel || 'No window'}`;
}

export function formatFinishedReviewAcknowledgement(
  appointment: FieldAppointment
): string | undefined {
  if (!appointment.finishedReviewedAt || !appointment.finishedReviewDecision) {
    return undefined;
  }

  const reviewer = appointment.finishedReviewedBy ? ` by ${appointment.finishedReviewedBy}` : '';
  return `Office review acknowledged${reviewer}: ${
    finishedReviewDecisionLabels[appointment.finishedReviewDecision]
  } (${appointment.finishedReviewedAt.slice(0, 10)})`;
}

export function summarizeAppointmentQueueState(
  appointmentId: string,
  pendingOperations: PendingOperation[]
): AppointmentQueueSummary | undefined {
  const appointmentOperations = pendingOperations.filter(
    (operation) =>
      (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') &&
      operation.appointmentId === appointmentId
  );

  if (appointmentOperations.length === 0) {
    return undefined;
  }

  if (
    appointmentOperations.some(
      (operation) => operation.state === 'conflict' || operation.state === 'rejected'
    )
  ) {
    return {
      label: 'Appointment change needs review before it can sync.',
      tone: 'alert'
    };
  }

  return {
    label: 'Appointment change queued on this device.',
    tone: 'attention'
  };
}

export function summarizeOfficeAppointmentChanges(
  previousSnapshot: FieldAssignedWorkResponse | null,
  nextSnapshot: FieldAssignedWorkResponse
): string[] {
  if (!previousSnapshot) {
    return [];
  }

  const previousAppointments = new Map<string, { appointment: FieldAppointment; job: FieldJob }>();
  for (const job of previousSnapshot.jobs) {
    for (const appointment of job.appointments) {
      previousAppointments.set(appointment.id, { appointment, job });
    }
  }

  const changes: string[] = [];
  const nextAppointmentIds = new Set<string>();

  for (const job of nextSnapshot.jobs) {
    for (const appointment of job.appointments) {
      nextAppointmentIds.add(appointment.id);
      const previous = previousAppointments.get(appointment.id);
      const jobLabel = `Job ${job.jobNumber}`;

      if (!previous) {
        changes.push(
          `${jobLabel} has a new appointment: ${formatAppointmentSchedule(appointment)}.`
        );
        continue;
      }

      if (hasScheduleChanged(previous.appointment, appointment)) {
        changes.push(
          `${jobLabel} appointment schedule changed to ${formatAppointmentSchedule(appointment)}.`
        );
      }

      if (previous.appointment.technicianId !== appointment.technicianId) {
        changes.push(
          `${jobLabel} appointment assignment changed to ${appointment.technicianName ?? 'Unassigned'}.`
        );
      }

      if (previous.appointment.status !== appointment.status) {
        changes.push(
          `${jobLabel} appointment status changed to ${formatStatusLabel(appointment.status)}.`
        );
      }
    }
  }

  for (const { appointment, job } of previousAppointments.values()) {
    if (!nextAppointmentIds.has(appointment.id)) {
      changes.push(`Job ${job.jobNumber} appointment no longer appears in your assigned work.`);
    }
  }

  return changes;
}

function hasScheduleChanged(previous: FieldAppointment, next: FieldAppointment): boolean {
  return (
    previous.scheduledDate !== next.scheduledDate ||
    previous.scheduledStartTime !== next.scheduledStartTime ||
    previous.scheduledEndTime !== next.scheduledEndTime ||
    previous.timeWindowLabel !== next.timeWindowLabel
  );
}

function formatStructuredTime(appointment: FieldAppointment): string | undefined {
  if (appointment.scheduledStartTime && appointment.scheduledEndTime) {
    return `${appointment.scheduledStartTime}-${appointment.scheduledEndTime}`;
  }

  return appointment.scheduledStartTime ?? appointment.scheduledEndTime;
}

function formatStatusLabel(status: FieldAppointment['status']): string {
  if (status === 'onTheWay') {
    return 'on the way';
  }

  if (status === 'noAnswer') {
    return 'no answer';
  }

  return status;
}
