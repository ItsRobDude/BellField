import type {
  EmployeeRoleId as ContractEmployeeRoleId,
  EmployeePermissionOverrides as ContractEmployeePermissionOverrides,
  EmployeeSummary as ContractEmployeeSummary,
  LoginRequest,
  LoginResponse,
  PermissionAction as ContractPermissionAction,
  PermissionArea as ContractPermissionArea,
  PermissionKey as ContractPermissionKey,
  RoleTemplate as ContractRoleTemplate,
  UpdateEmployeeRequest
} from '@bellfield/contracts';

export type EmployeeRoleId = ContractEmployeeRoleId;

export const employeeRoleIds = [
  'owner',
  'admin',
  'csr',
  'dispatcher',
  'bookKeeping',
  'technician'
] as const satisfies readonly EmployeeRoleId[];

export type PermissionAction = ContractPermissionAction;

export const permissionActions = ['view', 'create', 'edit', 'delete', 'approve', 'post', 'export', 'configure'] as const satisfies readonly PermissionAction[];

export type PermissionArea = ContractPermissionArea;

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

export type PermissionKey = ContractPermissionKey;

export const permissionKeys = permissionAreas.flatMap((area) =>
  permissionActions.map((action) => `${area}:${action}` as PermissionKey)
);

export type LoginSurface = 'office-web' | 'field-mobile';

export const loginSurfaces = ['office-web', 'field-mobile'] as const satisfies readonly LoginSurface[];

export type RoleTemplate = ContractRoleTemplate;

export type EmployeePermissionOverrides = ContractEmployeePermissionOverrides;

export type EmployeeRecord = {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  isActive: boolean;
  password: string;
  permissionOverrides: EmployeePermissionOverrides;
};

export type EmployeeSummary = ContractEmployeeSummary;

export type AuthorizedEmployee = EmployeeSummary & {
  sessionSurface: LoginSurface;
};

export type LoginRequestDto = LoginRequest;

export type LoginResponseDto = LoginResponse;

export type UpdateEmployeeRequestDto = UpdateEmployeeRequest;

export type SessionRecord = {
  token: string;
  employeeId: string;
  surface: LoginSurface;
  deviceLabel?: string;
  issuedAt: string;
};
