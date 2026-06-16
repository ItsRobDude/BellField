import type {
  AppointmentFinishOutcome as ContractAppointmentFinishOutcome,
  AppointmentStatus as ContractAppointmentStatus,
  BillingProjectionState as ContractBillingProjectionState,
  ContactMethodKind as ContractContactMethodKind,
  ContactMethodOwnerKind as ContractContactMethodOwnerKind,
  CostingPolicy as ContractCostingPolicy,
  CostingStatus as ContractCostingStatus,
  CrmSearchResult as ContractCrmSearchResult,
  EquipmentStatus as ContractEquipmentStatus,
  FieldSyncSource as ContractFieldSyncSource,
  FinishedVisitReviewDecision as ContractFinishedVisitReviewDecision,
  JobStatus as ContractJobStatus,
  JobsQueueKey as ContractJobsQueueKey,
  MediaAttachmentKind as ContractMediaAttachmentKind,
  RegisterEntryKind as ContractRegisterEntryKind,
  RegisterCatalogSnapshot as ContractRegisterCatalogSnapshot,
  SyncResult as ContractSyncResult
} from '@bellfield/contracts';

export type CustomerAccountRecord = {
  id: string;
  name: string;
  accountType: 'residential' | 'company' | 'propertyManager' | 'landlord';
  isActive: boolean;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  flags: string[];
};

export type ContactRecord = {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
};

export type ContactLinkRecord = {
  id: string;
  contactId: string;
  linkedRecordId: string;
  linkedRecordKind: 'customer' | 'location';
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
  endDate?: string;
};

export type ContactMethodRecord = {
  id: string;
  ownerKind: ContractContactMethodOwnerKind;
  ownerId: string;
  kind: ContractContactMethodKind;
  label: string;
  value: string;
  isPrimary: boolean;
  isActive: boolean;
  endedAt?: string;
};

export type OwnershipHistoryRecord = {
  id: string;
  locationId: string;
  customerId: string;
  startedAt: string;
  endedAt?: string;
  note?: string;
};

export type LocationRecord = {
  id: string;
  name: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  isActive: boolean;
  alternateBillToCustomerIds: string[];
};

export type EquipmentStatus = ContractEquipmentStatus;

export const equipmentStatuses = [
  'active',
  'inactive',
  'pendingInstall',
  'removed'
] as const satisfies readonly EquipmentStatus[];

export type EquipmentGroupRecord = {
  id: string;
  name: string;
  locationId?: string;
  inventoryLocationLabel?: string;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentHistoryKind =
  | 'created'
  | 'edited'
  | 'statusChanged'
  | 'placementChanged'
  | 'grouped'
  | 'ungrouped'
  | 'markedReplaced'
  | 'replacementLinkChanged';

export type EquipmentHistoryRecord = {
  id: string;
  equipmentId: string;
  occurredAt: string;
  actorName: string;
  kind: EquipmentHistoryKind;
  message: string;
};

export type EquipmentRecord = {
  id: string;
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupId?: string;
  replacesEquipmentId?: string;
  replacedByEquipmentId?: string;
  status: EquipmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateEquipmentInput = {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupName?: string;
  status: EquipmentStatus;
  notes?: string;
};

export type UpdateEquipmentInput = Partial<CreateEquipmentInput> & {
  clearSystemGroup?: boolean;
};

export type JobStatus = ContractJobStatus;
export type JobsQueueKey = ContractJobsQueueKey;

export const jobStatuses = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts',
  'completed',
  'closed',
  'cancelled'
] as const satisfies readonly JobStatus[];

/** Active (open) job phases: work can still happen. */
export const activeJobStatuses: readonly JobStatus[] = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts'
];

/** Final job phases: the job is closed to new work. */
export const finalJobStatuses: readonly JobStatus[] = ['completed', 'closed', 'cancelled'];

/** A reopen moves a job from a final phase back to an active one (gated on jobs:configure). */
export function isReopenTransition(currentStatus: JobStatus, nextStatus: JobStatus): boolean {
  return finalJobStatuses.includes(currentStatus) && activeJobStatuses.includes(nextStatus);
}

/** Whether a job is in a final phase (completed/closed/cancelled). */
export function isFinalJobStatus(status: JobStatus): boolean {
  return finalJobStatuses.includes(status);
}

/**
 * Cost-impacting writes (labor/expense/reversal, issue-to-job, receive-to-job) are blocked on
 * a final job so the finalized cost can't silently drift; revising it means reopening the job
 * (which supersedes the snapshot), correcting, then completing again (which re-freezes it).
 */
export const REOPEN_FOR_COST_WRITE_MESSAGE = 'Reopen the job before changing job cost.';

export type AppointmentStatus = ContractAppointmentStatus;

export const appointmentStatuses = [
  'scheduled',
  'confirmed',
  'dispatched',
  'onTheWay',
  'arrived',
  'working',
  'finished',
  'noAnswer',
  'cancelled'
] as const satisfies readonly AppointmentStatus[];

export type AppointmentFinishOutcome = ContractAppointmentFinishOutcome;
export type FinishedVisitReviewDecision = ContractFinishedVisitReviewDecision;
export type RegisterEntryKind = ContractRegisterEntryKind;
export type RegisterCatalogSnapshot = ContractRegisterCatalogSnapshot;
export type BillingProjectionState = ContractBillingProjectionState;
export type CostingPolicy = ContractCostingPolicy;
export type CostingStatus = ContractCostingStatus;
export type MediaAttachmentKind = ContractMediaAttachmentKind;

export const appointmentFinishOutcomes = [
  'completed',
  'followUpNeeded',
  'noAccess'
] as const satisfies readonly AppointmentFinishOutcome[];

export const finishedVisitReviewDecisions = [
  'keptOpen',
  'followUpScheduled'
] as const satisfies readonly FinishedVisitReviewDecision[];

export const registerEntryKinds = [
  'labor',
  'serviceItem',
  'part',
  'membership',
  'other'
] as const satisfies readonly RegisterEntryKind[];

export const billingProjectionStates = [
  'billable',
  'noChargeShown',
  'internalOnly',
  'notBilled'
] as const satisfies readonly BillingProjectionState[];

export const mediaAttachmentKinds = [
  'image',
  'video',
  'document'
] as const satisfies readonly MediaAttachmentKind[];

export type FieldSyncSource = ContractFieldSyncSource;

export const fieldSyncSources = ['field-save-queue'] as const satisfies readonly FieldSyncSource[];

export type SyncResult = ContractSyncResult;

export type CrmSearchRecord = ContractCrmSearchResult & {
  score: number;
};

export type CustomerDuplicateLookupInput = {
  normalizedName: string;
  normalizedPhone: string;
  normalizedAddress: string;
  excludedCustomerId?: string;
  limit: number;
};

export type LocationDuplicateLookupInput = {
  normalizedName: string;
  normalizedPhone: string;
  normalizedAddress: string;
  excludedLocationId?: string;
  limit: number;
};

export type LocationDuplicateCandidateRecord = LocationRecord & {
  customerName: string;
  customerFlags: string[];
};

export type JobTimelineEntry = {
  id: string;
  occurredAt: string;
  actorName: string;
  kind:
    | 'jobCreated'
    | 'jobStatusUpdated'
    | 'appointmentCreated'
    | 'appointmentScheduleUpdated'
    | 'appointmentStatusUpdated'
    | 'appointmentFinishedReview'
    | 'finishedVisitReviewAcknowledged'
    | 'registerEntryAdded'
    | 'registerEntryEdited'
    | 'registerEntryVoided'
    | 'registerCostResolved'
    | 'estimateCreated'
    | 'estimateUpdated'
    | 'estimateApproved'
    | 'estimateDeclined'
    | 'estimateConverted'
    | 'estimateSent'
    | 'estimateDeliveryFailed'
    | 'estimateSendCanceled'
    | 'invoicePosted'
    | 'invoiceAdjustmentCreated'
    | 'invoiceSent'
    | 'invoiceDeliveryFailed'
    | 'invoiceSendCanceled'
    | 'paymentLinkCreated'
    | 'paymentRecorded'
    | 'paymentVoided'
    | 'paymentRefunded'
    | 'paymentRefundFailed'
    | 'paymentReceiptSent'
    | 'paymentReceiptFailed'
    | 'refundReceiptSent'
    | 'refundReceiptFailed'
    | 'registerEntryNotReflected'
    | 'mediaAttached'
    | 'mediaCaptionEdited'
    | 'mediaVoided'
    | 'jobNote'
    | 'syncFlag';
  message: string;
};

export type JobRecord = {
  id: string;
  jobNumber: string;
  locationId: string;
  billToCustomerId: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber?: string;
  appointmentIds: string[];
  timeline: JobTimelineEntry[];
  createdAt: string;
  updatedAt: string;
};

export type JobDetailRecord = {
  job: JobRecord;
  appointments: AppointmentRecord[];
  timelineLimit: number;
  timelineHasMore: boolean;
};

export type JobsQueueCursor = {
  queueKey: JobsQueueKey;
  updatedAt: string;
  id: string;
};

export type JobsQueueAppointmentRecord = {
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
};

export type JobsQueueItemRecord = {
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
  nextAppointment?: JobsQueueAppointmentRecord;
  createdAt: string;
  updatedAt: string;
};

export type JobsQueuePageRecord = {
  jobs: JobsQueueItemRecord[];
  totalCount: number;
};

export type DispatchAppointmentRecord = {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: JobStatus;
  jobType: string;
  workOrderNumber?: string;
  status: AppointmentStatus;
  scheduledDate: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
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

export type CreateJobInput = {
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
};

export type AppointmentRecord = {
  id: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
  finishedReviewedAt?: string;
  finishedReviewedBy?: string;
  finishedReviewDecision?: FinishedVisitReviewDecision;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppointmentInput = {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
};

export type UpdateAppointmentScheduleInput = {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
};

export type RegisterEntryRecord = {
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
  catalogItemId?: string;
  catalogSnapshot?: RegisterCatalogSnapshot;
  inventoryItemId?: string;
  inventoryLocationId?: string;
  billingProjectionState: BillingProjectionState;
  costingPolicy?: CostingPolicy;
  costingStatus: CostingStatus;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRegisterEntryInput = {
  appointmentId?: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  totalAmount: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  catalogItemId?: string;
  catalogSnapshot?: RegisterCatalogSnapshot;
  inventoryItemId?: string;
  inventoryLocationId?: string;
  billingProjectionState?: BillingProjectionState;
  clientOperationId?: string;
};

export type UpdateRegisterEntryInput = Partial<
  Omit<CreateRegisterEntryInput, 'appointmentId' | 'unitPrice'>
> & {
  appointmentId?: string | null;
  unitPrice?: number | null;
};

export type MediaAttachmentRecord = {
  id: string;
  jobId: string;
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  storagePath?: string;
  uploadedAt?: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMediaAttachmentInput = {
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedAt: string;
  capturedByEmployeeId: string;
  capturedByName: string;
};

export type UpdateMediaAttachmentCaptionInput = {
  caption: string | null;
};
