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
  | 'send'
  | 'refund'
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
  | 'catalog'
  | 'agreements'
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

export interface IdentitySetupStatusResponse {
  /** True only while there are zero active employees and the in-memory setup token is valid. */
  setupRequired: boolean;
}

export interface CreateFirstOwnerRequest {
  /** One-time token printed to the API/server log at startup. Never rendered by the UI. */
  setupToken: string;
  email: string;
  displayName: string;
  /** Initial owner password (stored hashed; never returned). */
  password: string;
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

/** Create a new employee (Owner-only, `employeesPermissions:create`). The server generates the id. */
export interface CreateEmployeeRequest {
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  /** Initial password (stored hashed; never returned). */
  password: string;
  /** Defaults to active when omitted. */
  isActive?: boolean;
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
}

/** Admin-set password reset. The admin supplies the new value; it is never echoed back. */
export interface ResetEmployeePasswordRequest {
  password: string;
}

export interface ResetEmployeePasswordResponse {
  /** Sessions revoked as part of the reset (a reset always clears the target's sessions). */
  revokedSessionCount: number;
}

/** Full admin view of one employee: the summary (which carries overrides + effective permissions)
 * plus their active device sessions. */
export interface EmployeeAdminDetailResponse {
  employee: EmployeeSummary;
  sessions: EmployeeSessionSummary[];
}
