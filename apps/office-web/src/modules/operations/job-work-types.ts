import type {
  AppointmentStatus,
  JobsWorkspaceResponse,
  MediaAttachmentSummary,
  RegisterEntryKind,
  RegisterEntrySummary
} from '@/lib/operations-api';

export type AppointmentDraft = {
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  timeWindowLabel: string;
  technicianId: string;
};

export type AppointmentEditDraft = AppointmentDraft;

export type RegisterEntryEditDraft = {
  appointmentId: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  totalAmount: string;
  partNumber: string;
  inventorySourceLabel: string;
};

export type CapturedWorkDetails = {
  isOpen: boolean;
  isLoading: boolean;
  registerEntries: RegisterEntrySummary[];
  mediaAttachments: MediaAttachmentSummary[];
  registerDrafts: Record<string, RegisterEntryEditDraft>;
  mediaCaptionDrafts: Record<string, string>;
  registerVoidReasons: Record<string, string>;
  mediaVoidReasons: Record<string, string>;
};

export type PendingJobStatusChange = {
  jobId: string;
  currentStatus: JobsWorkspaceResponse['jobs'][number]['status'];
  nextStatus: JobsWorkspaceResponse['jobs'][number]['status'];
  jobSummary: string;
  reviewMessage: string;
  cancellableAppointmentCount: number;
  isSubmitting: boolean;
};

export type JobDetailTab =
  | 'overview'
  | 'appointments'
  | 'captured'
  | 'estimates'
  | 'media'
  | 'timeline';

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  onTheWay: 'On the way',
  arrived: 'Arrived',
  working: 'Working',
  finished: 'Finished',
  noAnswer: 'No answer',
  cancelled: 'Cancelled'
};

export const appointmentStatusOptions: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'dispatched',
  'onTheWay',
  'arrived',
  'working',
  'finished',
  'noAnswer',
  'cancelled'
];

export function createEmptyAppointmentDraft(): AppointmentDraft {
  return {
    scheduledDate: '',
    scheduledStartTime: '',
    scheduledEndTime: '',
    timeWindowLabel: '',
    technicianId: ''
  };
}

export function createAppointmentDraft(
  appointment: JobsWorkspaceResponse['jobs'][number]['appointments'][number]
): AppointmentEditDraft {
  return {
    scheduledDate: appointment.scheduledDate ?? '',
    scheduledStartTime: appointment.scheduledStartTime ?? '',
    scheduledEndTime: appointment.scheduledEndTime ?? '',
    timeWindowLabel: appointment.timeWindowLabel ?? '',
    technicianId: appointment.technicianId ?? ''
  };
}

export function getOfficeJobElementId(jobId: string): string {
  return `office-job-${jobId}`;
}
