import type {
  AppointmentFinishOutcome as ContractAppointmentFinishOutcome,
  AppointmentStatus as ContractAppointmentStatus,
  EquipmentStatus as ContractEquipmentStatus,
  FieldSyncSource as ContractFieldSyncSource,
  FinishedVisitReviewDecision as ContractFinishedVisitReviewDecision,
  JobStatus as ContractJobStatus,
  RegisterEntryKind as ContractRegisterEntryKind,
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

export const equipmentStatuses = ['active', 'inactive', 'pendingInstall', 'removed'] as const satisfies readonly EquipmentStatus[];

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

export const jobStatuses = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts',
  'completed',
  'closed',
  'cancelled'
] as const satisfies readonly JobStatus[];

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

export type FieldSyncSource = ContractFieldSyncSource;

export const fieldSyncSources = ['field-save-queue'] as const satisfies readonly FieldSyncSource[];

export type SyncResult = ContractSyncResult;

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
};

export type UpdateRegisterEntryInput = Partial<Omit<CreateRegisterEntryInput, 'appointmentId' | 'unitPrice'>> & {
  appointmentId?: string | null;
  unitPrice?: number | null;
};
