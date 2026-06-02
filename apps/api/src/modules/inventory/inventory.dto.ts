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
import type {
  CreateInventoryAdjustmentRequest,
  CreateInventoryItemRequest,
  CreateInventoryLocationRequest,
  CreateInventoryTransferRequest,
  UpdateInventoryItemRequest,
  UpdateInventoryLocationRequest
} from '@bellfield/contracts';
import {
  inventoryItemKinds,
  inventoryLocationKinds,
  type InventoryItemKindValue,
  type InventoryLocationKindValue
} from './inventory.types';

export class CreateInventoryItemRequestBodyDto implements CreateInventoryItemRequest {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(inventoryItemKinds)
  kind!: InventoryItemKindValue;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultUnitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateInventoryItemRequestBodyDto
  extends CreateInventoryItemRequestBodyDto
  implements UpdateInventoryItemRequest
{
  @IsBoolean()
  isActive!: boolean;
}

export class CreateInventoryLocationRequestBodyDto implements CreateInventoryLocationRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(inventoryLocationKinds)
  kind!: InventoryLocationKindValue;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedEmployeeId?: string;
}

export class UpdateInventoryLocationRequestBodyDto
  extends CreateInventoryLocationRequestBodyDto
  implements UpdateInventoryLocationRequest
{
  @IsBoolean()
  isActive!: boolean;
}

export class CreateInventoryAdjustmentRequestBodyDto implements CreateInventoryAdjustmentRequest {
  @IsString()
  @MinLength(1)
  itemId!: string;

  @IsString()
  @MinLength(1)
  locationId!: string;

  // Signed: positive = gain, negative = loss. Zero is rejected in the service.
  @IsNumber({ maxDecimalPlaces: 4 })
  quantityDelta!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateInventoryTransferRequestBodyDto implements CreateInventoryTransferRequest {
  @IsString()
  @MinLength(1)
  itemId!: string;

  @IsString()
  @MinLength(1)
  fromLocationId!: string;

  @IsString()
  @MinLength(1)
  toLocationId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
