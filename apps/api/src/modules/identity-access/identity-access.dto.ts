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
  type EmployeeRoleId,
  type LoginRequestDto,
  type PermissionKey,
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
