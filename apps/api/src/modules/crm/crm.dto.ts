import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';
import type {
  CreateContactRequestDto,
  CreateCustomerRequestDto,
  CreateLocationRequestDto,
  LinkContactRequestDto,
  ReassignLocationOwnerRequestDto,
  UpdateContactLinkRequestDto,
  UpdateContactRequestDto,
  UpdateCustomerRequestDto,
  UpdateLocationRequestDto
} from './crm.types';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export class CreateCustomerRequestBodyDto implements CreateCustomerRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  accountType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  billingAddressLine1!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  billingCity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  billingState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  billingPostalCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  flags?: string[];

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class UpdateCustomerRequestBodyDto implements UpdateCustomerRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  accountType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  billingCity?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  billingPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  flags?: string[];

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class CreateLocationRequestBodyDto implements CreateLocationRequestDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  addressLine1!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  state!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternateBillToCustomerIds?: string[];

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class UpdateLocationRequestBodyDto implements UpdateLocationRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternateBillToCustomerIds?: string[];

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class ReassignLocationOwnerRequestBodyDto implements ReassignLocationOwnerRequestDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateContactRequestBodyDto implements CreateContactRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateContactRequestBodyDto implements UpdateContactRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];

  @IsIn(['global', 'link'])
  scope!: 'global' | 'link';

  @ValidateIf((value) => value.scope === 'link')
  @IsString()
  @MinLength(1)
  linkId?: string;
}

export class LinkContactRequestBodyDto implements LinkContactRequestDto {
  @IsString()
  @MinLength(1)
  contactId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  locationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateContactLinkRequestBodyDto implements UpdateContactLinkRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Matches(isoDatePattern, { message: 'endDate must be in YYYY-MM-DD format.' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
