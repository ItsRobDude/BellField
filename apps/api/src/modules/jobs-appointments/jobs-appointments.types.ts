import type {
  AddJobNoteRequest,
  AcknowledgeFinishedVisitReviewRequest,
  AppointmentFinishOutcome,
  AppointmentSummary,
  ContactSummary,
  CreateAppointmentRequest,
  CreateJobRequest,
  CreateRegisterEntryRequest,
  CustomerAccountSummary,
  FieldAssignedWorkResponse,
  JobIntakeContextResponse,
  JobMutationResponse,
  JobsWorkspaceResponse,
  JobSummary,
  JobTimelineEntry,
  LocationSummary,
  RegisterEntriesResponse,
  RegisterEntrySummary,
  UpdateAppointmentScheduleRequest,
  UpdateAppointmentStatusRequest,
  UpdateRegisterEntryRequest,
  UpdateJobStatusRequest,
  UpdateJobStatusResponse,
  VoidRegisterEntryRequest
} from '@bellfield/contracts';

export type CustomerAccountSummaryDto = CustomerAccountSummary;
export type ContactSummaryDto = ContactSummary;
export type LocationSummaryDto = LocationSummary;
export type TechnicianOptionDto = JobsWorkspaceResponse['technicians'][number];
export type JobTimelineEntryDto = JobTimelineEntry;
export type AppointmentSummaryDto = AppointmentSummary;
export type AppointmentFinishOutcomeDto = AppointmentFinishOutcome;
export type JobSummaryDto = JobSummary;
export type RegisterEntrySummaryDto = RegisterEntrySummary;
export type RegisterEntriesResponseDto = RegisterEntriesResponse;
export type JobsWorkspaceResponseDto = JobsWorkspaceResponse;
export type JobIntakeContextResponseDto = JobIntakeContextResponse;
export type CreateJobRequestDto = CreateJobRequest;
export type UpdateJobStatusRequestDto = UpdateJobStatusRequest;
export type UpdateJobStatusResponseDto = UpdateJobStatusResponse;
export type CreateAppointmentRequestDto = CreateAppointmentRequest;
export type UpdateAppointmentScheduleRequestDto = UpdateAppointmentScheduleRequest;
export type UpdateAppointmentStatusRequestDto = UpdateAppointmentStatusRequest;
export type AddJobNoteRequestDto = AddJobNoteRequest;
export type CreateRegisterEntryRequestDto = CreateRegisterEntryRequest;
export type UpdateRegisterEntryRequestDto = UpdateRegisterEntryRequest;
export type VoidRegisterEntryRequestDto = VoidRegisterEntryRequest;
export type AcknowledgeFinishedVisitReviewRequestDto = AcknowledgeFinishedVisitReviewRequest;
export type JobMutationResponseDto = JobMutationResponse;
export type FieldAssignedWorkResponseDto = FieldAssignedWorkResponse;
