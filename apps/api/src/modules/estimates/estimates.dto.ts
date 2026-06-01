import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import type {
  ConvertEstimateToInvoiceRequest,
  CreateEstimateRequest,
  DeclineEstimateRequest,
  EstimateDiscount,
  EstimateLineItemInput,
  UpdateEstimateRequest
} from '@bellfield/contracts';
import { estimateLineItemKinds, type EstimateLineItemKindValue } from './estimates.types';

export class EstimateLineItemInputDto implements EstimateLineItemInput {
  @IsIn(estimateLineItemKinds)
  kind!: EstimateLineItemKindValue;

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

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsBoolean()
  taxable!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  partNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventorySourceLabel?: string;
}

// Discount is a small discriminated union; class-validator cannot express that
// cleanly, so we accept a loosely-typed object here and rely on the engine +
// the DB shape constraint to reject malformed combinations. The service maps it
// through the typed contract shape.
export class CreateEstimateRequestBodyDto implements CreateEstimateRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxRateBasisPoints?: number;

  @IsOptional()
  @IsObject()
  discount?: EstimateDiscount;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateLineItemInputDto)
  lineItems!: EstimateLineItemInputDto[];
}

export class UpdateEstimateRequestBodyDto implements UpdateEstimateRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxRateBasisPoints?: number;

  @IsOptional()
  @IsObject()
  discount?: EstimateDiscount | null;

  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateLineItemInputDto)
  lineItems?: EstimateLineItemInputDto[];
}

export class DeclineEstimateRequestBodyDto implements DeclineEstimateRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ConvertEstimateToInvoiceRequestBodyDto implements ConvertEstimateToInvoiceRequest {
  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}
