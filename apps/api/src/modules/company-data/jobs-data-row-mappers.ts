import {
  toIsoString,
  toOptionalDateString,
  toOptionalTimeString
} from '../../database/database-row.utils';
import type {
  AppointmentFinishOutcome,
  AppointmentRecord,
  AppointmentStatus,
  DispatchAppointmentRecord,
  FinishedVisitReviewDecision,
  JobStatus,
  JobTimelineEntry,
  JobsQueueItemRecord,
  JobsQueueKey
} from './company-data.types';

// Raw database row shapes for the jobs read/command repositories, kept here with the pure
// mappers that turn them into domain records. No query or transaction logic lives in this file.

export type JobRow = {
  id: string;
  jobNumber: string;
  locationId: string;
  billToCustomerId: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type AppointmentRow = {
  id: string;
  jobId: string;
  scheduledDate: string | Date | null;
  scheduledStartTime: string | Date | null;
  scheduledEndTime: string | Date | null;
  timeWindowLabel: string | null;
  technicianId: string | null;
  status: AppointmentStatus;
  finishOutcome: AppointmentFinishOutcome | null;
  visitNotes: string | null;
  hasChargeActivity: boolean | null;
  registerFollowUpNote: string | null;
  finishedReviewedAt: string | Date | null;
  finishedReviewedBy: string | null;
  finishedReviewDecision: FinishedVisitReviewDecision | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type DispatchAppointmentRow = {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: JobStatus;
  jobType: string;
  workOrderNumber: string | null;
  status: AppointmentStatus;
  scheduledDate: string | Date;
  scheduledStartTime: string | Date | null;
  scheduledEndTime: string | Date | null;
  timeWindowLabel: string | null;
  technicianId: string | null;
  technicianName: string | null;
  locationId: string;
  locationName: string;
  locationAddressLine1: string;
  locationCity: string;
  locationState: string;
  billToCustomerId: string;
  billToCustomerName: string;
  customerName: string;
  needsOfficeReview: boolean;
};

export type JobsQueueItemRow = {
  id: string;
  jobNumber: string;
  locationId: string;
  locationName: string;
  billToCustomerId: string;
  billToCustomerName: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber: string | null;
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  nextAppointmentId: string | null;
  nextAppointmentJobId: string | null;
  nextAppointmentScheduledDate: string | Date | null;
  nextAppointmentScheduledStartTime: string | Date | null;
  nextAppointmentScheduledEndTime: string | Date | null;
  nextAppointmentTimeWindowLabel: string | null;
  nextAppointmentTechnicianId: string | null;
  nextAppointmentTechnicianName: string | null;
  nextAppointmentStatus: AppointmentStatus | null;
  nextAppointmentNeedsOfficeReview: boolean | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  totalCount: string | number;
};

export type JobsQueuePageRow = Partial<JobsQueueItemRow> & {
  totalCount: string | number;
};

export type TimelineRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

export type FinishReviewInput = {
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
};

export function toAppointmentRecord(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    scheduledDate: toOptionalDateString(row.scheduledDate),
    scheduledStartTime: toOptionalTimeString(row.scheduledStartTime),
    scheduledEndTime: toOptionalTimeString(row.scheduledEndTime),
    timeWindowLabel: row.timeWindowLabel ?? undefined,
    technicianId: row.technicianId ?? undefined,
    status: row.status,
    finishOutcome: row.finishOutcome ?? undefined,
    visitNotes: row.visitNotes ?? undefined,
    hasChargeActivity: row.hasChargeActivity ?? undefined,
    registerFollowUpNote: row.registerFollowUpNote ?? undefined,
    finishedReviewedAt: row.finishedReviewedAt ? toIsoString(row.finishedReviewedAt) : undefined,
    finishedReviewedBy: row.finishedReviewedBy ?? undefined,
    finishedReviewDecision: row.finishedReviewDecision ?? undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

export function toDispatchAppointmentRecord(
  row: DispatchAppointmentRow
): DispatchAppointmentRecord {
  return {
    appointmentId: row.appointmentId,
    jobId: row.jobId,
    jobNumber: row.jobNumber,
    jobSummary: row.jobSummary,
    jobStatus: row.jobStatus,
    jobType: row.jobType,
    workOrderNumber: row.workOrderNumber ?? undefined,
    status: row.status,
    scheduledDate: toOptionalDateString(row.scheduledDate) as string,
    scheduledStartTime: toOptionalTimeString(row.scheduledStartTime),
    scheduledEndTime: toOptionalTimeString(row.scheduledEndTime),
    timeWindowLabel: row.timeWindowLabel ?? undefined,
    technicianId: row.technicianId ?? undefined,
    technicianName: row.technicianName ?? undefined,
    locationId: row.locationId,
    locationName: row.locationName,
    locationAddressLine1: row.locationAddressLine1,
    locationCity: row.locationCity,
    locationState: row.locationState,
    billToCustomerId: row.billToCustomerId,
    billToCustomerName: row.billToCustomerName,
    customerName: row.customerName,
    needsOfficeReview: row.needsOfficeReview
  };
}

export function toJobsQueueItemRecord(row: JobsQueueItemRow): JobsQueueItemRecord {
  return {
    id: row.id,
    jobNumber: row.jobNumber,
    locationId: row.locationId,
    locationName: row.locationName,
    billToCustomerId: row.billToCustomerId,
    billToCustomerName: row.billToCustomerName,
    jobType: row.jobType,
    category: row.category,
    origin: row.origin,
    summary: row.summary,
    status: row.status,
    workOrderNumber: row.workOrderNumber ?? undefined,
    needsScheduling: row.needsScheduling,
    needsOfficeReview: row.needsOfficeReview,
    nextAppointment:
      row.nextAppointmentId && row.nextAppointmentJobId && row.nextAppointmentStatus
        ? {
            id: row.nextAppointmentId,
            jobId: row.nextAppointmentJobId,
            scheduledDate: toOptionalDateString(row.nextAppointmentScheduledDate),
            scheduledStartTime: toOptionalTimeString(row.nextAppointmentScheduledStartTime),
            scheduledEndTime: toOptionalTimeString(row.nextAppointmentScheduledEndTime),
            timeWindowLabel: row.nextAppointmentTimeWindowLabel ?? undefined,
            technicianId: row.nextAppointmentTechnicianId ?? undefined,
            technicianName: row.nextAppointmentTechnicianName ?? undefined,
            status: row.nextAppointmentStatus,
            needsOfficeReview: Boolean(row.nextAppointmentNeedsOfficeReview)
          }
        : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

export function getJobsQueueCondition(queueKey: JobsQueueKey): string {
  switch (queueKey) {
    case 'review':
      return 'needs_office_review = true';
    case 'waitingOnParts':
      return "needs_office_review = false and status = 'waitingOnParts'";
    case 'unscheduled':
      return "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = true";
    case 'open':
      return "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = false";
  }
}

export function toTimelineEntry(row: TimelineRow): JobTimelineEntry {
  return {
    id: row.id,
    occurredAt: toIsoString(row.occurredAt),
    actorName: row.actorName,
    kind: row.kind,
    message: row.message
  };
}

export function buildScheduleUpdateMessage(
  scheduledDate?: string,
  scheduledStartTime?: string,
  scheduledEndTime?: string,
  timeWindowLabel?: string,
  technicianId?: string
): string {
  const parts = ['Appointment scheduling details updated'];

  if (scheduledDate) {
    parts.push(`for ${scheduledDate}`);
  }

  const structuredTime = formatStructuredScheduleTime(scheduledStartTime, scheduledEndTime);

  if (structuredTime) {
    parts.push(`from ${structuredTime}`);
  }

  if (timeWindowLabel) {
    parts.push(`during ${timeWindowLabel}`);
  }

  if (technicianId) {
    parts.push('with technician assignment updated');
  }

  return `${parts.join(' ')}.`;
}

export function buildAppointmentCreatedMessage(appointment: AppointmentRecord): string {
  const parts = ['Appointment added'];

  if (appointment.scheduledDate) {
    parts.push(`for ${appointment.scheduledDate}`);
  }

  const structuredTime = formatStructuredScheduleTime(
    appointment.scheduledStartTime,
    appointment.scheduledEndTime
  );

  if (structuredTime) {
    parts.push(`from ${structuredTime}`);
  }

  return `${parts.join(' ')}.`;
}

export function formatStructuredScheduleTime(
  scheduledStartTime?: string,
  scheduledEndTime?: string
): string | undefined {
  if (scheduledStartTime && scheduledEndTime) {
    return `${scheduledStartTime} to ${scheduledEndTime}`;
  }

  if (scheduledStartTime) {
    return `${scheduledStartTime}`;
  }

  if (scheduledEndTime) {
    return `ending ${scheduledEndTime}`;
  }

  return undefined;
}

export function buildFinishReviewMessage(finishReview?: FinishReviewInput): string {
  const outcome = finishReview?.finishOutcome
    ? `Outcome: ${finishReview.finishOutcome}.`
    : 'Finish review saved.';
  const notesPart = finishReview?.visitNotes?.trim()
    ? ' Visit notes captured.'
    : ' No visit notes captured.';
  const chargePart =
    finishReview?.hasChargeActivity === undefined
      ? ''
      : finishReview.hasChargeActivity
        ? ' Charge activity was reported.'
        : ' No charge activity was reported.';
  const followUpPart = finishReview?.registerFollowUpNote?.trim()
    ? ' Register or follow-up reminder was captured.'
    : '';

  return `${outcome}${notesPart}${chargePart}${followUpPart}`;
}
