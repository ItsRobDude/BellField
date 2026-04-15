import { IsArray, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { equipmentStatuses, fieldSyncSources, type EquipmentStatus, type FieldSyncSource } from '../company-data/company-data.types';
import type { CreateEquipmentRequestDto, UpdateEquipmentFieldRequestDto } from './equipment.types';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export class CreateEquipmentRequestBodyDto implements CreateEquipmentRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventoryLocationLabel?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  equipmentType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  serialNumber!: string;

  @IsArray()
  @IsString({ each: true })
  filterSizes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  equipmentLocationDescription?: string;

  @IsOptional()
  @Matches(isoDatePattern, { message: 'installDate must be in YYYY-MM-DD format.' })
  installDate?: string;

  @IsIn(equipmentStatuses)
  status!: EquipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateEquipmentFieldRequestBodyDto implements UpdateEquipmentFieldRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventoryLocationLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filterSizes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  equipmentLocationDescription?: string;

  @IsOptional()
  @Matches(isoDatePattern, { message: 'installDate must be in YYYY-MM-DD format.' })
  installDate?: string;

  @IsOptional()
  @IsIn(equipmentStatuses)
  status?: EquipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsISO8601()
  baseUpdatedAt?: string;

  @IsOptional()
  @IsIn(fieldSyncSources)
  syncSource?: FieldSyncSource;
}
