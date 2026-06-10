import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import type {
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest
} from '@bellfield/contracts';
import { catalogItemKinds, type CatalogItemKindValue } from './catalog.types';

class CatalogItemRequestBodyDto implements CreateCatalogItemRequest {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(catalogItemKinds)
  kind!: CatalogItemKindValue;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tradeTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitOfMeasure?: string;

  @IsOptional()
  @IsBoolean()
  taxableDefault?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  defaultSalePrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  agreementPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedLaborHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costHint?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  linkedInventoryItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  incomeCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountingExportCode?: string;

  @IsOptional()
  @IsBoolean()
  fieldVisible?: boolean;
}

export class CreateCatalogItemRequestBodyDto
  extends CatalogItemRequestBodyDto
  implements CreateCatalogItemRequest {}

export class UpdateCatalogItemRequestBodyDto
  extends CatalogItemRequestBodyDto
  implements UpdateCatalogItemRequest
{
  @IsBoolean()
  declare taxableDefault: boolean;

  @IsBoolean()
  declare fieldVisible: boolean;

  @IsBoolean()
  isActive!: boolean;
}

export class CreateCatalogCategoryRequestBodyDto implements CreateCatalogCategoryRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(-100000)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  defaultTaxable?: boolean;
}

export class UpdateCatalogCategoryRequestBodyDto implements UpdateCatalogCategoryRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(-100000)
  @Max(100000)
  sortOrder!: number;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsBoolean()
  defaultTaxable?: boolean;
}
