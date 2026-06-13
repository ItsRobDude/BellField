import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import {
  createBellFieldTranslator,
  type BellFieldMessageKey,
  type BellFieldTranslator
} from '@bellfield/i18n';
import type { PendingOperation } from './field-sync-types';

type FieldJob = FieldAssignedWorkResponse['jobs'][number];
type FieldAppointment = FieldJob['appointments'][number];
type FieldLocation = FieldAssignedWorkResponse['locations'][number];
type FinishedReviewDecision = NonNullable<FieldAppointment['finishedReviewDecision']>;

const defaultTranslator = createBellFieldTranslator('en');

export type AppointmentQueueSummary = {
  label: string;
  tone: 'attention' | 'alert';
};

const finishedReviewDecisionLabelKeys = {
  keptOpen: 'fieldAppointment.officeKeptOpen',
  followUpScheduled: 'fieldAppointment.officeScheduledFollowUp'
} satisfies Record<FinishedReviewDecision, BellFieldMessageKey>;

const appointmentStatusLabelKeys = {
  arrived: 'fieldAppointment.status.arrived',
  cancelled: 'fieldAppointment.status.cancelled',
  confirmed: 'fieldAppointment.status.confirmed',
  dispatched: 'fieldAppointment.status.dispatched',
  finished: 'fieldAppointment.status.finished',
  noAnswer: 'fieldAppointment.status.noAnswer',
  onTheWay: 'fieldAppointment.status.onTheWay',
  scheduled: 'fieldAppointment.status.scheduled',
  working: 'fieldAppointment.status.working'
} satisfies Record<FieldAppointment['status'], BellFieldMessageKey>;

export function formatFieldLocationAddress(
  location: FieldLocation | undefined,
  t: BellFieldTranslator = defaultTranslator
): string {
  if (!location) {
    return t('fieldAppointment.unknownLocationAddress');
  }

  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const cityStatePostal = [cityState, location.postalCode].filter(Boolean).join(' ');
  return [location.addressLine1, cityStatePostal].filter(Boolean).join(', ');
}

export function formatWorkOrderLine(
  job: Pick<FieldJob, 'workOrderNumber'>,
  t: BellFieldTranslator = defaultTranslator
): string | undefined {
  if (!job.workOrderNumber) {
    return undefined;
  }

  return `${t('fieldAppointment.workOrder')}: ${job.workOrderNumber}`;
}

export function formatAppointmentSchedule(
  appointment: FieldAppointment,
  t: BellFieldTranslator = defaultTranslator
): string {
  const dateLabel = appointment.scheduledDate || t('fieldAppointment.unscheduled');
  const structuredTime = formatStructuredTime(appointment);

  if (structuredTime) {
    return `${dateLabel} - ${structuredTime}`;
  }

  return `${dateLabel} - ${appointment.timeWindowLabel || t('fieldAppointment.noWindow')}`;
}

export function formatFinishedReviewAcknowledgement(
  appointment: FieldAppointment,
  t: BellFieldTranslator = defaultTranslator
): string | undefined {
  if (!appointment.finishedReviewedAt || !appointment.finishedReviewDecision) {
    return undefined;
  }

  const reviewer = appointment.finishedReviewedBy
    ? ` ${t('fieldAppointment.officeReviewBy')} ${appointment.finishedReviewedBy}`
    : '';
  return `${t('fieldAppointment.officeReviewAcknowledged')}${reviewer}: ${t(
    finishedReviewDecisionLabelKeys[appointment.finishedReviewDecision]
  )} (${appointment.finishedReviewedAt.slice(0, 10)})`;
}

export function summarizeAppointmentQueueState(
  appointmentId: string,
  pendingOperations: PendingOperation[],
  t: BellFieldTranslator = defaultTranslator
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
      label: t('fieldAppointment.changeNeedsReview'),
      tone: 'alert'
    };
  }

  return {
    label: t('fieldAppointment.changeQueued'),
    tone: 'attention'
  };
}

export function summarizeOfficeAppointmentChanges(
  previousSnapshot: FieldAssignedWorkResponse | null,
  nextSnapshot: FieldAssignedWorkResponse,
  t: BellFieldTranslator = defaultTranslator
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
      const jobLabel = `${t('fieldAppointment.job')} ${job.jobNumber}`;

      if (!previous) {
        changes.push(
          `${jobLabel} ${t('fieldAppointment.hasNewAppointment')}: ${formatAppointmentSchedule(
            appointment,
            t
          )}.`
        );
        continue;
      }

      if (hasScheduleChanged(previous.appointment, appointment)) {
        changes.push(
          `${jobLabel} ${t('fieldAppointment.scheduleChangedTo')} ${formatAppointmentSchedule(
            appointment,
            t
          )}.`
        );
      }

      if (previous.appointment.technicianId !== appointment.technicianId) {
        changes.push(
          `${jobLabel} ${t('fieldAppointment.assignmentChangedTo')} ${
            appointment.technicianName ?? t('fieldAppointment.unassigned')
          }.`
        );
      }

      if (previous.appointment.status !== appointment.status) {
        changes.push(
          `${jobLabel} ${t('fieldAppointment.statusChangedTo')} ${formatStatusLabel(
            appointment.status,
            t
          )}.`
        );
      }
    }
  }

  for (const { appointment, job } of previousAppointments.values()) {
    if (!nextAppointmentIds.has(appointment.id)) {
      changes.push(
        `${t('fieldAppointment.job')} ${job.jobNumber} ${t('fieldAppointment.noLongerAppears')}`
      );
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

function formatStatusLabel(
  status: FieldAppointment['status'],
  t: BellFieldTranslator = defaultTranslator
): string {
  return t(appointmentStatusLabelKeys[status]);
}
