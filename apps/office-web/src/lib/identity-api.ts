import type {
  CreateFirstOwnerRequest,
  CurrentSessionResponse,
  EmployeeAdminDetailResponse,
  EmployeeListResponse,
  EmployeeRoleId,
  EmployeeSessionSummary,
  EmployeeSummary,
  IdentitySetupStatusResponse,
  LoginResponse,
  PermissionKey,
  ResetEmployeePasswordResponse,
  RevokeEmployeeSessionResponse,
  RoleTemplate,
  RoleTemplateListResponse
} from '@bellfield/contracts';
import { resolveOfficeApiBaseUrl } from './api-base-url';

export type {
  EmployeeAdminDetailResponse,
  EmployeeRoleId,
  EmployeeSessionSummary,
  EmployeeSummary,
  IdentitySetupStatusResponse,
  LoginResponse,
  PermissionKey,
  ResetEmployeePasswordResponse,
  RevokeEmployeeSessionResponse,
  RoleTemplate
};

type RoleListResponse = RoleTemplateListResponse;

export class OfficeIdentityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'OfficeIdentityApiError';
  }
}

export function isOfficeSessionExpiredError(error: unknown): error is OfficeIdentityApiError {
  return (
    error instanceof OfficeIdentityApiError &&
    error.status === 401 &&
    error.code === 'sessionExpired'
  );
}

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl, headers, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
    } | null;
    throw new OfficeIdentityApiError(
      errorBody?.message ?? 'Request failed.',
      response.status,
      typeof errorBody?.code === 'string' ? errorBody.code : undefined
    );
  }

  return (await response.json()) as TResponse;
}

export async function loginToOfficeApi(input: {
  email: string;
  password: string;
  deviceLabel?: string;
  apiBaseUrl?: string;
}): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/identity/auth/login', {
    apiBaseUrl: input.apiBaseUrl,
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      surface: 'office-web',
      deviceLabel: input.deviceLabel
    })
  });
}

export async function getOfficeSetupStatus(input: {
  apiBaseUrl?: string;
}): Promise<IdentitySetupStatusResponse> {
  return requestJson<IdentitySetupStatusResponse>('/identity/setup/status', {
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function createFirstOwner(
  input: CreateFirstOwnerRequest & {
    apiBaseUrl?: string;
  }
): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/identity/setup/first-owner', {
    apiBaseUrl: input.apiBaseUrl,
    method: 'POST',
    body: JSON.stringify({
      setupToken: input.setupToken,
      email: input.email,
      displayName: input.displayName,
      password: input.password
    })
  });
}

export async function getCurrentOfficeSession(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CurrentSessionResponse> {
  return requestJson<CurrentSessionResponse>('/identity/auth/me', {
    apiBaseUrl: input.apiBaseUrl,
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    }
  });
}

export async function getOfficeEmployees(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EmployeeListResponse> {
  return requestJson<EmployeeListResponse>('/identity/employees', {
    apiBaseUrl: input.apiBaseUrl,
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    }
  });
}

export async function getOfficeRoles(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<RoleListResponse> {
  return requestJson<RoleListResponse>('/identity/roles', {
    apiBaseUrl: input.apiBaseUrl,
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    }
  });
}

/** Admin detail for one employee: summary (overrides + effective perms) + active device sessions. */
export async function getEmployeeDetail(input: {
  employeeId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EmployeeAdminDetailResponse> {
  return requestJson<EmployeeAdminDetailResponse>(`/identity/employees/${input.employeeId}`, {
    apiBaseUrl: input.apiBaseUrl,
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    }
  });
}

export async function updateOfficeEmployee(input: {
  employeeId: string;
  sessionToken: string;
  roleId?: EmployeeRoleId;
  isActive?: boolean;
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
  apiBaseUrl?: string;
}): Promise<EmployeeSummary> {
  return requestJson<EmployeeSummary>(`/identity/employees/${input.employeeId}`, {
    apiBaseUrl: input.apiBaseUrl,
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    },
    body: JSON.stringify({
      roleId: input.roleId,
      isActive: input.isActive,
      grantedPermissions: input.grantedPermissions,
      revokedPermissions: input.revokedPermissions
    })
  });
}

/** Create an employee (Owner-only `employeesPermissions:create`). Password is hashed, never returned. */
export async function createOfficeEmployee(input: {
  sessionToken: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  password: string;
  isActive?: boolean;
  apiBaseUrl?: string;
}): Promise<EmployeeSummary> {
  return requestJson<EmployeeSummary>('/identity/employees', {
    apiBaseUrl: input.apiBaseUrl,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.sessionToken}`
    },
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      roleId: input.roleId,
      password: input.password,
      isActive: input.isActive
    })
  });
}

/** Admin password reset: revokes all of the target's sessions; the password is never echoed back. */
export async function resetOfficeEmployeePassword(input: {
  employeeId: string;
  sessionToken: string;
  password: string;
  apiBaseUrl?: string;
}): Promise<ResetEmployeePasswordResponse> {
  return requestJson<ResetEmployeePasswordResponse>(
    `/identity/employees/${input.employeeId}/password-reset`,
    {
      apiBaseUrl: input.apiBaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.sessionToken}`
      },
      body: JSON.stringify({ password: input.password })
    }
  );
}

/** Revoke one device session of an employee by its non-secret id. */
export async function revokeOfficeEmployeeSession(input: {
  employeeId: string;
  sessionId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<RevokeEmployeeSessionResponse> {
  return requestJson<RevokeEmployeeSessionResponse>(
    `/identity/employees/${input.employeeId}/sessions/${input.sessionId}/revoke`,
    {
      apiBaseUrl: input.apiBaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.sessionToken}`
      }
    }
  );
}
