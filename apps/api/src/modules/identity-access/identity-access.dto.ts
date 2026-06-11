import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';
import {
  employeeRoleIds,
  loginSurfaces,
  permissionKeys,
  type CreateEmployeeRequestDto,
  type CreateFirstOwnerRequestDto,
  type EmployeeRoleId,
  type LoginRequestDto,
  type PermissionKey,
  type ResetEmployeePasswordRequestDto,
  type UpdateEmployeeRequestDto
} from './identity-access.types';

export class LoginRequestBodyDto implements LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsIn(loginSurfaces)
  surface!: (typeof loginSurfaces)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}

export class CreateFirstOwnerRequestBodyDto implements CreateFirstOwnerRequestDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  setupToken!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class UpdateEmployeeRequestBodyDto implements UpdateEmployeeRequestDto {
  @IsOptional()
  @IsIn(employeeRoleIds)
  roleId?: EmployeeRoleId;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(permissionKeys, { each: true })
  grantedPermissions?: PermissionKey[];

  @IsOptional()
  @IsArray()
  @IsIn(permissionKeys, { each: true })
  revokedPermissions?: PermissionKey[];
}

export class CreateEmployeeRequestBodyDto implements CreateEmployeeRequestDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsIn(employeeRoleIds)
  roleId!: EmployeeRoleId;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(permissionKeys, { each: true })
  grantedPermissions?: PermissionKey[];

  @IsOptional()
  @IsArray()
  @IsIn(permissionKeys, { each: true })
  revokedPermissions?: PermissionKey[];
}

export class ResetEmployeePasswordRequestBodyDto implements ResetEmployeePasswordRequestDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
