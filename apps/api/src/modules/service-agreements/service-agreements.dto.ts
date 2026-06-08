import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import type {
  CatalogLineSnapshot,
  CreateServiceAgreementRequest,
  ServiceAgreementStatusChangeRequest,
  ServiceAgreementVisitTemplateInput,
  UpdateServiceAgreementRequest
} from '@bellfield/contracts';
import {
  serviceAgreementBillingCadences,
  serviceAgreementStatuses,
  serviceAgreementVisitFrequencies,
  type ServiceAgreementBillingCadenceValue,
  type ServiceAgreementStatusValue,
  type ServiceAgreementVisitFrequencyValue
} from './service-agreements.types';

export class ListServiceAgreementsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locationId?: string;

  @IsOptional()
  @IsIn(serviceAgreementStatuses)
  status?: ServiceAgreementStatusValue;
}

export class ServiceAgreementReferenceDataQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agreementId?: string;
}

class ServiceAgreementVisitTemplateRequestDto implements ServiceAgreementVisitTemplateInput {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsIn(serviceAgreementVisitFrequencies)
  frequency!: ServiceAgreementVisitFrequencyValue;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  intervalMonths?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(12)
  preferredMonth?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(31)
  preferredDayOfMonth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeWindowLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ServiceAgreementMutationRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceCatalogItemId?: string;

  @IsOptional()
  sourceCatalogSnapshot?: CatalogLineSnapshot;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceEstimateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceEstimateLineItemId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  renewalDate?: string;

  @IsOptional()
  @IsIn(serviceAgreementBillingCadences)
  billingCadence?: ServiceAgreementBillingCadenceValue;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  billingAmount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  coveredLocationIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  coveredEquipmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => ServiceAgreementVisitTemplateRequestDto)
  visitTemplates?: ServiceAgreementVisitTemplateRequestDto[];
}

export class CreateServiceAgreementRequestBodyDto
  extends ServiceAgreementMutationRequestDto
  implements CreateServiceAgreementRequest
{
  @IsString()
  @MaxLength(64)
  customerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  declare name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  declare coveredLocationIds: string[];
}

export class UpdateServiceAgreementRequestBodyDto
  extends ServiceAgreementMutationRequestDto
  implements UpdateServiceAgreementRequest {}

export class ServiceAgreementStatusChangeRequestBodyDto
  implements ServiceAgreementStatusChangeRequest
{
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
