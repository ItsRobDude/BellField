import { BadRequestException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  ResolveRegisterCostRequest,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';

type ResolveRegisterCostMode = ResolveRegisterCostRequest['mode'];
const resolveRegisterCostModes: readonly ResolveRegisterCostMode[] = [
  'trackedInventory',
  'nonStockMaterial',
  'laborActual',
  'zeroCost'
];

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

/**
 * Flat body for resolving a register line's cost. The fields required depend on `mode`; that
 * cross-field shape is enforced when narrowing to the discriminated request (the union the
 * domain works with) via `toResolveRegisterCostRequest`.
 */
export class ResolveRegisterCostRequestBodyDto {
  @IsIn(resolveRegisterCostModes)
  mode!: ResolveRegisterCostMode;

  @IsOptional()
  @IsString()
  @MinLength(1)
  itemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  locationId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  hours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ratePerHour?: number;
}

/** Narrow the flat resolve body into the discriminated request, rejecting missing fields. */
export function toResolveRegisterCostRequest(
  body: ResolveRegisterCostRequestBodyDto
): ResolveRegisterCostRequest {
  switch (body.mode) {
    case 'trackedInventory':
      if (!body.itemId || !body.locationId) {
        throw new BadRequestException('Tracked inventory resolution needs itemId and locationId.');
      }
      return { mode: 'trackedInventory', itemId: body.itemId, locationId: body.locationId };
    case 'nonStockMaterial':
      if (body.amount === undefined) {
        throw new BadRequestException('Non-stock material resolution needs an amount.');
      }
      return { mode: 'nonStockMaterial', amount: body.amount };
    case 'laborActual':
      if (body.hours === undefined || body.ratePerHour === undefined) {
        throw new BadRequestException('Labor resolution needs hours and ratePerHour.');
      }
      return { mode: 'laborActual', hours: body.hours, ratePerHour: body.ratePerHour };
    case 'zeroCost':
      return { mode: 'zeroCost' };
  }
}
