import type {
  CreateEmployeeRequest,
  EmployeeRoleId as ContractEmployeeRoleId,
  EmployeePermissionOverrides as ContractEmployeePermissionOverrides,
  EmployeeSummary as ContractEmployeeSummary,
  LoginRequest,
  LoginResponse,
  PermissionAction as ContractPermissionAction,
  PermissionArea as ContractPermissionArea,
  PermissionKey as ContractPermissionKey,
  ResetEmployeePasswordRequest,
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

export const permissionActions = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'post',
  'export',
  'configure'
] as const satisfies readonly PermissionAction[];

export type PermissionArea = ContractPermissionArea;

export const permissionAreas = [
  'customers',
  'locations',
  'contacts',
  'equipment',
  'jobs',
  'appointmentsDispatch',
  'register',
  'media',
  'estimates',
  'invoices',
  'payments',
  'purchasing',
  'inventory',
  'jobCosting',
  'reports',
  'employeesPermissions',
  'companySettings',
  'supportLogsBackups',
  'history'
] as const satisfies readonly PermissionArea[];

export type PermissionKey = ContractPermissionKey;

export const permissionKeys = permissionAreas.flatMap((area) =>
  permissionActions.map((action) => `${area}:${action}` as PermissionKey)
);

export type LoginSurface = 'office-web' | 'field-mobile';

export const loginSurfaces = [
  'office-web',
  'field-mobile'
] as const satisfies readonly LoginSurface[];

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

export type CreateEmployeeRequestDto = CreateEmployeeRequest;

export type ResetEmployeePasswordRequestDto = ResetEmployeePasswordRequest;

/** Sensitive identity-access admin actions recorded in admin_audit_entries (matches the SQL CHECK). */
export const adminAuditActions = [
  'employee_created',
  'employee_role_changed',
  'employee_activated',
  'employee_deactivated',
  'employee_overrides_changed',
  'employee_password_reset',
  'employee_session_revoked'
] as const;

export type AdminAuditAction = (typeof adminAuditActions)[number];

/** One append-only audit row. Carries non-secret context only (no passwords/tokens/bodies). */
export type AdminAuditEntry = {
  id: string;
  occurredAt: string;
  actorEmployeeId: string;
  actorName: string;
  actorEmail: string;
  targetEmployeeId: string;
  targetName: string;
  targetEmail: string;
  action: AdminAuditAction;
  summary: string;
};

export type SessionRecord = {
  /** Bearer token — secret, the auth lookup key. Never surfaced to clients as an identifier. */
  token: string;
  /** Non-secret id surfaced to the admin UI for listing/revoking sessions. */
  id: string;
  employeeId: string;
  surface: LoginSurface;
  deviceLabel?: string;
  issuedAt: string;
};
