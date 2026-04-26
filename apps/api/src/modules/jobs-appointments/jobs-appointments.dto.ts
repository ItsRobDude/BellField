import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  appointmentFinishOutcomes,
  appointmentStatuses,
  fieldSyncSources,
  jobStatuses,
  type AppointmentFinishOutcome,
  type AppointmentStatus,
  type FieldSyncSource,
  type JobStatus
} from '../company-data/company-data.types';
import type {
  AddJobNoteRequestDto,
  CreateAppointmentRequestDto,
  CreateJobRequestDto,
  UpdateAppointmentScheduleRequestDto,
  UpdateAppointmentStatusRequestDto,
  UpdateJobStatusRequestDto
} from './jobs-appointments.types';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export class CreateJobRequestBodyDto implements CreateJobRequestDto {
  @IsString()
  @MinLength(1)
  locationId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  billToCustomerId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  jobType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  origin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  summary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workOrderNumber?: string;

  @IsOptional()
  @Matches(isoDatePattern, { message: 'scheduledDate must be in YYYY-MM-DD format.' })
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timeWindowLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  technicianId?: string;
}

export class UpdateJobStatusRequestBodyDto implements UpdateJobStatusRequestDto {
  @IsIn(jobStatuses)
  status!: JobStatus;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class CreateAppointmentRequestBodyDto implements CreateAppointmentRequestDto {
  @IsOptional()
  @Matches(isoDatePattern, { message: 'scheduledDate must be in YYYY-MM-DD format.' })
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timeWindowLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  technicianId?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class UpdateAppointmentScheduleRequestBodyDto implements UpdateAppointmentScheduleRequestDto {
  @IsOptional()
  @Matches(isoDatePattern, { message: 'scheduledDate must be in YYYY-MM-DD format.' })
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timeWindowLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  technicianId?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class UpdateAppointmentStatusRequestBodyDto implements UpdateAppointmentStatusRequestDto {
  @IsIn(appointmentStatuses)
  status!: AppointmentStatus;

  @IsOptional()
  @IsIn(appointmentFinishOutcomes)
  finishOutcome?: AppointmentFinishOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  visitNotes?: string;

  @IsOptional()
  @IsBoolean()
  hasChargeActivity?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  registerFollowUpNote?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsISO8601()
  baseUpdatedAt?: string;

  @IsOptional()
  @IsIn(fieldSyncSources)
  syncSource?: FieldSyncSource;
}

export class AddJobNoteRequestBodyDto implements AddJobNoteRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsISO8601()
  baseUpdatedAt?: string;

  @IsOptional()
  @IsIn(fieldSyncSources)
  syncSource?: FieldSyncSource;
}
