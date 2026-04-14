import type { AppointmentStatus, JobStatus, SyncResult } from '../company-data/company-data.types';

export type CustomerAccountSummaryDto = {
  id: string;
  name: string;
  accountType: string;
  phone?: string;
  email?: string;
  flags: string[];
};

export type ContactSummaryDto = {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  tags: string[];
};

export type LocationSummaryDto = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  contacts: ContactSummaryDto[];
  alternateBillToCustomerIds: string[];
};

export type TechnicianOptionDto = {
  id: string;
  displayName: string;
  roleId: string;
};

export type JobTimelineEntryDto = {
  id: string;
  occurredAt: string;
  actorName: string;
  kind: string;
  message: string;
};

export type AppointmentSummaryDto = {
  id: string;
  jobId: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type JobSummaryDto = {
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
  appointments: AppointmentSummaryDto[];
  timeline: JobTimelineEntryDto[];
  createdAt: string;
  updatedAt: string;
};

export type JobsWorkspaceResponseDto = {
  customers: CustomerAccountSummaryDto[];
  locations: LocationSummaryDto[];
  technicians: TechnicianOptionDto[];
  jobs: JobSummaryDto[];
};

export type CreateJobRequestDto = {
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

export type UpdateJobStatusRequestDto = {
  status: JobStatus;
  occurredAt?: string;
};

export type UpdateJobStatusResponseDto = JobSummaryDto & {
  warningMessages?: string[];
};

export type CreateAppointmentRequestDto = {
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
};

export type UpdateAppointmentStatusRequestDto = {
  status: AppointmentStatus;
  occurredAt?: string;
  baseUpdatedAt?: string;
};

export type AddJobNoteRequestDto = {
  note: string;
  occurredAt?: string;
};

export type JobMutationResponseDto = JobSummaryDto & {
  syncResult?: SyncResult;
};

export type FieldAssignedWorkResponseDto = {
  jobs: JobSummaryDto[];
  locations: LocationSummaryDto[];
  customers: CustomerAccountSummaryDto[];
  equipment: Array<{
    id: string;
    locationId?: string;
    equipmentType: string;
    brand: string;
    model: string;
    serialNumber: string;
    filterSizes: string[];
    equipmentLocationDescription?: string;
    installDate?: string;
    status: string;
    notes: string;
    updatedAt: string;
  }>;
  serverTime: string;
  snapshotVersion: string;
  windowStartDate: string;
  windowEndDate: string;
};
