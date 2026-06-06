export type EmployeeRoleId =
  | 'owner'
  | 'admin'
  | 'csr'
  | 'dispatcher'
  | 'bookKeeping'
  | 'technician';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'post'
  | 'export'
  | 'configure';

export type PermissionArea =
  | 'customers'
  | 'locations'
  | 'contacts'
  | 'equipment'
  | 'jobs'
  | 'appointmentsDispatch'
  | 'register'
  | 'media'
  | 'estimates'
  | 'invoices'
  | 'payments'
  | 'purchasing'
  | 'inventory'
  | 'jobCosting'
  | 'reports'
  | 'employeesPermissions'
  | 'companySettings'
  | 'supportLogsBackups'
  | 'history';

export type PermissionKey = `${PermissionArea}:${PermissionAction}`;

export interface RoleTemplate {
  id: EmployeeRoleId;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface EmployeePermissionOverrides {
  grantedPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
}

export interface EmployeeSummary {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  roleName: string;
  isActive: boolean;
  effectivePermissions: PermissionKey[];
  permissionOverrides: EmployeePermissionOverrides;
}

export interface LoginRequest {
  email: string;
  password: string;
  surface: 'office-web' | 'field-mobile';
  deviceLabel?: string;
}

export interface LoginResponse {
  sessionToken: string;
  employee: EmployeeSummary;
}

export interface CurrentSessionResponse {
  employee: EmployeeSummary;
}

export interface EmployeeListResponse {
  employees: EmployeeSummary[];
}

export interface RoleTemplateListResponse {
  roles: RoleTemplate[];
}

export interface UpdateEmployeeRequest {
  roleId?: EmployeeRoleId;
  isActive?: boolean;
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
}

/** A device session shown in the admin Employees surface. Deliberately carries NO bearer token. */
export interface EmployeeSessionSummary {
  /** Non-secret session id (revoke target) — not the bearer token. */
  id: string;
  surface: 'office-web' | 'field-mobile';
  deviceLabel?: string;
  issuedAt: string;
}

export interface EmployeeSessionsResponse {
  sessions: EmployeeSessionSummary[];
}

export interface RevokeEmployeeSessionResponse {
  /** True if a matching session was found and revoked. */
  revoked: boolean;
}
