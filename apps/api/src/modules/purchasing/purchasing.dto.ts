import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import type {
  CreatePurchaseOrderLineRequest,
  CreatePurchaseOrderRequest
} from '@bellfield/contracts';
import { purchaseOrderLineKinds, type PurchaseOrderLineKindValue } from './purchasing.types';

export class CreatePurchaseOrderLineRequestBodyDto implements CreatePurchaseOrderLineRequest {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemId?: string;

  @IsIn(purchaseOrderLineKinds)
  kind!: PurchaseOrderLineKindValue;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedUnitCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  equipmentBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  equipmentModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  equipmentSerial?: string;
}

export class CreatePurchaseOrderRequestBodyDto implements CreatePurchaseOrderRequest {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  poNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  vendorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  destinationInventoryLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  destinationCustomerLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineRequestBodyDto)
  lines!: CreatePurchaseOrderLineRequestBodyDto[];
}
