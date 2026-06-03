import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';

export class CreateJobLaborRequestBodyDto implements CreateJobLaborRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  hours!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ratePerHour!: number;
}

export class CreateJobExpenseRequestBodyDto implements CreateJobExpenseRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class ReverseJobCostEventRequestBodyDto implements ReverseJobCostEventRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
