import type { CustomerAccountSummary, LocationSummary } from './crm.js';
import type { EquipmentSummary } from './equipment.js';
import type { MediaAttachmentSummary } from './media.js';

export type JobStatus =
  | 'new'
  | 'scheduled'
  | 'inProgress'
  | 'waitingOnParts'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'dispatched'
  | 'onTheWay'
  | 'arrived'
  | 'working'
  | 'finished'
  | 'noAnswer'
  | 'cancelled';

export type AppointmentFinishOutcome = 'completed' | 'followUpNeeded' | 'noAccess';

export type FinishedVisitReviewDecision = 'keptOpen' | 'followUpScheduled';

export type RegisterEntryKind = 'labor' | 'serviceItem' | 'part' | 'membership' | 'other';

export interface SyncResult {
  status: 'applied' | 'conflict' | 'rejected' | 'retryableFailure';
  message?: string;
}

export type FieldSyncSource = 'field-save-queue';

export interface AppointmentSummary {
  id: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
  finishedReviewedAt?: string;
  finishedReviewedBy?: string;
  finishedReviewDecision?: FinishedVisitReviewDecision;
  needsOfficeReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobTimelineEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  kind: string;
  message: string;
}

export interface RegisterEntrySummary {
  id: string;
  jobId: string;
  appointmentId?: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  totalAmount: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobSummary {
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
  workOrderNumber?: string;
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  appointments: AppointmentSummary[];
  registerEntries?: RegisterEntrySummary[];
  timeline: JobTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface JobsWorkspaceResponse {
  customers: CustomerAccountSummary[];
  locations: LocationSummary[];
  technicians: Array<{
    id: string;
    displayName: string;
    roleId: string;
  }>;
  jobs: JobSummary[];
}

export interface JobIntakeContextResponse {
  technicians: JobsWorkspaceResponse['technicians'];
}

export interface JobDetailResponse {
  job: JobSummary;
  location: LocationSummary;
  billToCustomer: CustomerAccountSummary;
  technicians: JobsWorkspaceResponse['technicians'];
  equipment: EquipmentSummary[];
  registerEntries: RegisterEntrySummary[];
  mediaAttachments: MediaAttachmentSummary[];
  timelineLimit: number;
  timelineHasMore: boolean;
}

export type JobsQueueKey = 'review' | 'waitingOnParts' | 'unscheduled' | 'open';

export interface JobsQueueAppointmentSummary {
  id: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  needsOfficeReview: boolean;
}

export interface JobsQueueItem {
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
  workOrderNumber?: string;
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  nextAppointment?: JobsQueueAppointmentSummary;
  createdAt: string;
  updatedAt: string;
}

export interface JobsQueueSection {
  key: JobsQueueKey;
  totalCount: number;
  jobs: JobsQueueItem[];
  nextCursor?: string;
}

export interface JobsQueueResponse {
  limit: number;
  queues: JobsQueueSection[];
}

export interface CreateJobRequest {
  locationId: string;
  billToCustomerId?: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  workOrderNumber?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
}

export interface UpdateJobStatusRequest {
  status: JobStatus;
  occurredAt?: string;
}

export interface UpdateJobStatusResponse extends JobSummary {
  warningMessages?: string[];
}

export interface CreateAppointmentRequest {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
}

export interface UpdateAppointmentScheduleRequest {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface AddJobNoteRequest {
  note: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface RegisterEntriesResponse {
  registerEntries: RegisterEntrySummary[];
}

export interface CreateRegisterEntryRequest {
  appointmentId?: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  totalAmount: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface UpdateRegisterEntryRequest {
  appointmentId?: string | null;
  kind?: RegisterEntryKind;
  description?: string;
  quantity?: number;
  unitOfMeasure?: string;
  unitPrice?: number | null;
  totalAmount?: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface VoidRegisterEntryRequest {
  reason?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface AcknowledgeFinishedVisitReviewRequest {
  decision: Extract<FinishedVisitReviewDecision, 'keptOpen'>;
  occurredAt?: string;
}

export interface JobMutationResponse extends JobSummary {
  warningMessages?: string[];
  syncResult?: SyncResult;
}

export interface FieldAssignedWorkResponse {
  jobs: JobSummary[];
  locations: LocationSummary[];
  customers: CustomerAccountSummary[];
  equipment: EquipmentSummary[];
  serverTime: string;
  snapshotVersion: string;
  windowStartDate: string;
  windowEndDate: string;
}
