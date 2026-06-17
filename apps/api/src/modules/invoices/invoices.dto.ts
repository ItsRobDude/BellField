import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import {
  maxInvoiceNumber,
  type CreateAdjustmentRequest,
  type InvoiceAdjustmentKind,
  type InvoiceLineItemInput,
  type SendInvoiceRequest,
  type UpdateInvoiceNumberingRequest,
  type VoidInvoiceLineItemRequest
} from '@bellfield/contracts';
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

export class CreateAdjustmentRequestBodyDto implements CreateAdjustmentRequest {
  @IsIn(['adjustment', 'credit'])
  kind!: InvoiceAdjustmentKind;
}

export class SendInvoiceRequestBodyDto implements SendInvoiceRequest {
  @IsEmail()
  @MaxLength(254)
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bodyText?: string;
}

export class UpdateInvoiceNumberingRequestBodyDto implements UpdateInvoiceNumberingRequest {
  @IsInt()
  @Min(1)
  @Max(maxInvoiceNumber)
  nextNumber!: number;
}
