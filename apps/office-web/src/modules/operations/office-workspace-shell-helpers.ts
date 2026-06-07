import type {
  CustomerDetail,
  JobStatus,
  JobsQueueKey,
  JobsQueueResponse,
  LocationDetail,
  MediaAttachmentSummary,
  RegisterEntrySummary
} from '@/lib/operations-api';
import type {
  JobIntakeCustomerLocationOption,
  JobIntakeSelectedLocation
} from './job-intake-panel';
import type { CapturedWorkDetails, RegisterEntryEditDraft } from './job-work-types';

export function toJobIntakeSelectedLocation(location: LocationDetail): JobIntakeSelectedLocation {
  return {
    id: location.id,
    name: location.name,
    customerId: location.customerId,
    customerName: location.customerName,
    addressLine1: location.addressLine1,
    city: location.city,
    state: location.state,
    postalCode: location.postalCode
  };
}

export function toActiveCustomerLocationOptions(
  customer: CustomerDetail
): JobIntakeCustomerLocationOption[] {
  return customer.locations
    .filter((location) => location.isActive)
    .map((location) => ({
      id: location.id,
      name: location.name,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode
    }));
}

export function getJobStatusReviewMessage(
  currentStatus: JobStatus,
  nextStatus: JobStatus,
  jobSummary: string,
  cancellableAppointmentCount = 0
): string {
  if (currentStatus === nextStatus) {
    return `Already ${formatJobStatusLabel(nextStatus)}.`;
  }

  if (nextStatus === 'cancelled') {
    if (cancellableAppointmentCount === 0) {
      return `Cancel "${jobSummary}"?`;
    }

    return `Cancel "${jobSummary}" and ${formatAppointmentCount(cancellableAppointmentCount)}?`;
  }

  return `Change status to ${formatJobStatusLabel(nextStatus)}?`;
}

export function buildCapturedWorkDetails(
  registerEntries: RegisterEntrySummary[],
  mediaAttachments: MediaAttachmentSummary[],
  previous?: CapturedWorkDetails
): CapturedWorkDetails {
  return {
    isOpen: previous?.isOpen ?? true,
    isLoading: false,
    registerEntries,
    mediaAttachments,
    registerDrafts: Object.fromEntries(
      registerEntries.map((entry) => [entry.id, createRegisterEntryDraft(entry)])
    ),
    mediaCaptionDrafts: Object.fromEntries(
      mediaAttachments.map((media) => [media.id, media.caption ?? ''])
    ),
    registerVoidReasons: previous?.registerVoidReasons ?? {},
    mediaVoidReasons: previous?.mediaVoidReasons ?? {}
  };
}

export function createLoadingCapturedWorkDetails(
  previous?: CapturedWorkDetails
): CapturedWorkDetails {
  return {
    isOpen: true,
    isLoading: true,
    registerEntries: previous?.registerEntries ?? [],
    mediaAttachments: previous?.mediaAttachments ?? [],
    registerDrafts: previous?.registerDrafts ?? {},
    mediaCaptionDrafts: previous?.mediaCaptionDrafts ?? {},
    registerVoidReasons: previous?.registerVoidReasons ?? {},
    mediaVoidReasons: previous?.mediaVoidReasons ?? {}
  };
}

export function parseRequiredNumber(value: string, fieldLabel: string): number {
  if (!value.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }
  return parsed;
}

export function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  return parseRequiredNumber(value, 'Unit price');
}

export function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function mergeJobsQueueSection(
  current: JobsQueueResponse,
  nextPage: JobsQueueResponse,
  queueKey: JobsQueueKey
): JobsQueueResponse {
  const nextSection = nextPage.queues.find((section) => section.key === queueKey);

  if (!nextSection) {
    return current;
  }

  return {
    limit: current.limit,
    queues: current.queues.map((section) =>
      section.key === queueKey
        ? {
            ...nextSection,
            jobs: [...section.jobs, ...nextSection.jobs],
            totalCount: nextSection.totalCount
          }
        : section
    )
  };
}

function createRegisterEntryDraft(entry: RegisterEntrySummary): RegisterEntryEditDraft {
  return {
    appointmentId: entry.appointmentId ?? '',
    kind: entry.kind,
    description: entry.description,
    quantity: String(entry.quantity),
    unitOfMeasure: entry.unitOfMeasure ?? '',
    unitPrice: entry.unitPrice === undefined ? '' : String(entry.unitPrice),
    totalAmount: String(entry.totalAmount),
    partNumber: entry.partNumber ?? '',
    inventorySourceLabel: entry.inventorySourceLabel ?? ''
  };
}

function formatAppointmentCount(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`;
}

function formatJobStatusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    new: 'New',
    scheduled: 'Scheduled',
    inProgress: 'In progress',
    waitingOnParts: 'Waiting on parts',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled'
  };

  return labels[status];
}
