export type EmployeeRoleId =
  | 'owner'
  | 'admin'
  | 'csr'
  | 'dispatcher'
  | 'bookKeeping'
  | 'technician';

export const employeeRoleIds = [
  'owner',
  'admin',
  'csr',
  'dispatcher',
  'bookKeeping',
  'technician'
] as const satisfies readonly EmployeeRoleId[];

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'post' | 'export' | 'configure';

export const permissionActions = ['view', 'create', 'edit', 'delete', 'approve', 'post', 'export', 'configure'] as const satisfies readonly PermissionAction[];

export type PermissionArea =
  | 'customers'
  | 'locations'
  | 'contacts'
  | 'equipment'
  | 'jobs'
  | 'appointmentsDispatch'
  | 'estimates'
  | 'invoices'
  | 'payments'
  | 'purchasing'
  | 'inventory'
  | 'reports'
  | 'employeesPermissions'
  | 'companySettings'
  | 'supportLogsBackups';

export const permissionAreas = [
  'customers',
  'locations',
  'contacts',
  'equipment',
  'jobs',
  'appointmentsDispatch',
  'estimates',
  'invoices',
  'payments',
  'purchasing',
  'inventory',
  'reports',
  'employeesPermissions',
  'companySettings',
  'supportLogsBackups'
] as const satisfies readonly PermissionArea[];

export type PermissionKey = `${PermissionArea}:${PermissionAction}`;

export const permissionKeys = permissionAreas.flatMap((area) =>
  permissionActions.map((action) => `${area}:${action}` as PermissionKey)
);

export type LoginSurface = 'office-web' | 'field-mobile';

export const loginSurfaces = ['office-web', 'field-mobile'] as const satisfies readonly LoginSurface[];

export type RoleTemplate = {
  id: EmployeeRoleId;
  name: string;
  description: string;
  permissions: PermissionKey[];
};

export type EmployeePermissionOverrides = {
  grantedPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
};

export type EmployeeRecord = {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  isActive: boolean;
  password: string;
  permissionOverrides: EmployeePermissionOverrides;
};

export type EmployeeSummary = {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  roleName: string;
  isActive: boolean;
  effectivePermissions: PermissionKey[];
  permissionOverrides: EmployeePermissionOverrides;
};

export type AuthorizedEmployee = EmployeeSummary & {
  sessionSurface: LoginSurface;
};

export type LoginRequestDto = {
  email: string;
  password: string;
  surface: LoginSurface;
  deviceLabel?: string;
};

export type LoginResponseDto = {
  sessionToken: string;
  employee: EmployeeSummary;
};

export type UpdateEmployeeRequestDto = {
  roleId?: EmployeeRoleId;
  isActive?: boolean;
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
};

export type SessionRecord = {
  token: string;
  employeeId: string;
  surface: LoginSurface;
  deviceLabel?: string;
  issuedAt: string;
};
