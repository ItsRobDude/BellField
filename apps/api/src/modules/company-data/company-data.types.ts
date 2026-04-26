import type {
  AppointmentStatus as ContractAppointmentStatus,
  EquipmentStatus as ContractEquipmentStatus,
  FieldSyncSource as ContractFieldSyncSource,
  JobStatus as ContractJobStatus,
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

export const equipmentStatuses = ['active', 'inactive', 'pendingInstall'] as const satisfies readonly EquipmentStatus[];

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
  status: EquipmentStatus;
  notes?: string;
};

export type UpdateEquipmentInput = Partial<CreateEquipmentInput>;

export type JobStatus = ContractJobStatus;

export const jobStatuses = ['open', 'closed', 'posted', 'cancelled'] as const satisfies readonly JobStatus[];

export type AppointmentStatus = ContractAppointmentStatus;

export const appointmentStatuses = [
  'assigned',
  'confirmed',
  'onTheWay',
  'arrived',
  'working',
  'finished',
  'noAnswer',
  'cancelled'
] as const satisfies readonly AppointmentStatus[];

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
    | 'appointmentStatusUpdated'
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
  timeWindowLabel?: string;
  technicianId?: string;
};

export type AppointmentRecord = {
  id: string;
  jobId: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppointmentInput = {
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
};
