import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import type { InvoiceLineItemInput, VoidInvoiceLineItemRequest } from '@bellfield/contracts';
import {
  estimateLineItemKinds,
  type EstimateLineItemKindValue
} from '../estimates/estimates.types';

// Invoice line kinds are the same set as estimate line kinds.
export class InvoiceLineItemInputDto implements InvoiceLineItemInput {
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
}

export class VoidInvoiceLineItemRequestBodyDto implements VoidInvoiceLineItemRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
