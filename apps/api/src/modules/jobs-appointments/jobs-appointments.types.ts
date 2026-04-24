import type {
  AddJobNoteRequest,
  AppointmentSummary,
  ContactSummary,
  CreateAppointmentRequest,
  CreateJobRequest,
  CustomerAccountSummary,
  FieldAssignedWorkResponse,
  JobMutationResponse,
  JobsWorkspaceResponse,
  JobSummary,
  JobTimelineEntry,
  LocationSummary,
  UpdateAppointmentStatusRequest,
  UpdateJobStatusRequest,
  UpdateJobStatusResponse
} from '@bellfield/contracts';

export type CustomerAccountSummaryDto = CustomerAccountSummary;
export type ContactSummaryDto = ContactSummary;
export type LocationSummaryDto = LocationSummary;
export type TechnicianOptionDto = JobsWorkspaceResponse['technicians'][number];
export type JobTimelineEntryDto = JobTimelineEntry;
export type AppointmentSummaryDto = AppointmentSummary;
export type JobSummaryDto = JobSummary;
export type JobsWorkspaceResponseDto = JobsWorkspaceResponse;
export type CreateJobRequestDto = CreateJobRequest;
export type UpdateJobStatusRequestDto = UpdateJobStatusRequest;
export type UpdateJobStatusResponseDto = UpdateJobStatusResponse;
export type CreateAppointmentRequestDto = CreateAppointmentRequest;
export type UpdateAppointmentStatusRequestDto = UpdateAppointmentStatusRequest;
export type AddJobNoteRequestDto = AddJobNoteRequest;
export type JobMutationResponseDto = JobMutationResponse;
export type FieldAssignedWorkResponseDto = FieldAssignedWorkResponse;
