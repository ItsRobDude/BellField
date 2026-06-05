import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface
} from 'class-validator';
import {
  appointmentFinishOutcomes,
  appointmentStatuses,
  billingProjectionStates,
  fieldSyncSources,
  finishedVisitReviewDecisions,
  jobStatuses,
  registerEntryKinds,
  type AppointmentFinishOutcome,
  type AppointmentStatus,
  type BillingProjectionState,
  type FieldSyncSource,
  type FinishedVisitReviewDecision,
  type JobStatus,
  type RegisterEntryKind
} from '../company-data/company-data.types';
import type {
  AddJobNoteRequestDto,
  AcknowledgeFinishedVisitReviewRequestDto,
  CreateAppointmentRequestDto,
  CreateJobRequestDto,
  CreateRegisterEntryRequestDto,
  UpdateAppointmentScheduleRequestDto,
  UpdateAppointmentStatusRequestDto,
  UpdateRegisterEntryRequestDto,
  UpdateJobStatusRequestDto,
  VoidRegisterEntryRequestDto
} from './jobs-appointments.types';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

type AppointmentScheduleBody = {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
};

@ValidatorConstraint({ name: 'scheduleTimesRequireDate', async: false })
class ScheduleTimesRequireDateConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const request = args.object as AppointmentScheduleBody;
    const hasStructuredTime = Boolean(request.scheduledStartTime || request.scheduledEndTime);

    return !hasStructuredTime || Boolean(request.scheduledDate);
  }

  defaultMessage(): string {
    return 'scheduledDate is required when scheduledStartTime or scheduledEndTime is provided.';
  }
}

@ValidatorConstraint({ name: 'scheduleEndAfterStart', async: false })
class ScheduleEndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const request = args.object as AppointmentScheduleBody;

    if (!request.scheduledStartTime || !request.scheduledEndTime) {
      return true;
    }

    return request.scheduledEndTime > request.scheduledStartTime;
  }

  defaultMessage(): string {
    return 'scheduledEndTime must be after scheduledStartTime.';
  }
}

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
  @Matches(localTimePattern, { message: 'scheduledStartTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  scheduledStartTime?: string;

  @IsOptional()
  @Matches(localTimePattern, { message: 'scheduledEndTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  @Validate(ScheduleEndAfterStartConstraint)
  scheduledEndTime?: string;

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
  @Matches(localTimePattern, { message: 'scheduledStartTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  scheduledStartTime?: string;

  @IsOptional()
  @Matches(localTimePattern, { message: 'scheduledEndTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  @Validate(ScheduleEndAfterStartConstraint)
  scheduledEndTime?: string;

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

export class UpdateAppointmentScheduleRequestBodyDto
  implements UpdateAppointmentScheduleRequestDto
{
  @IsOptional()
  @Matches(isoDatePattern, { message: 'scheduledDate must be in YYYY-MM-DD format.' })
  scheduledDate?: string;

  @IsOptional()
  @Matches(localTimePattern, { message: 'scheduledStartTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  scheduledStartTime?: string;

  @IsOptional()
  @Matches(localTimePattern, { message: 'scheduledEndTime must be in HH:mm format.' })
  @Validate(ScheduleTimesRequireDateConstraint)
  @Validate(ScheduleEndAfterStartConstraint)
  scheduledEndTime?: string;

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

export class CreateRegisterEntryRequestBodyDto implements CreateRegisterEntryRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  appointmentId?: string;

  @IsIn(registerEntryKinds)
  kind!: RegisterEntryKind;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  partNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventorySourceLabel?: string;

  @IsOptional()
  @IsIn(billingProjectionStates)
  billingProjectionState?: BillingProjectionState;

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

export class UpdateRegisterEntryRequestBodyDto implements UpdateRegisterEntryRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  appointmentId?: string | null;

  @IsOptional()
  @IsIn(registerEntryKinds)
  kind?: RegisterEntryKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  partNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventorySourceLabel?: string;

  @IsOptional()
  @IsIn(billingProjectionStates)
  billingProjectionState?: BillingProjectionState;

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

export class VoidRegisterEntryRequestBodyDto implements VoidRegisterEntryRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

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

export class AcknowledgeFinishedVisitReviewRequestBodyDto
  implements AcknowledgeFinishedVisitReviewRequestDto
{
  @IsIn(finishedVisitReviewDecisions.filter((decision) => decision === 'keptOpen'))
  decision!: Extract<FinishedVisitReviewDecision, 'keptOpen'>;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
