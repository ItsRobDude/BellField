import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { CreateJobExpenseRequest, CreateJobLaborRequest } from '@bellfield/contracts';

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
