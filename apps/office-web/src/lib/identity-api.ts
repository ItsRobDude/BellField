import type {
  CurrentSessionResponse,
  EmployeeAdminDetailResponse,
  EmployeeListResponse,
  EmployeeRoleId,
  EmployeeSessionSummary,
  EmployeeSummary,
  LoginResponse,
  RoleTemplate,
  RoleTemplateListResponse
} from '@bellfield/contracts';
import { resolveOfficeApiBaseUrl } from './api-base-url';

export type {
  EmployeeAdminDetailResponse,
  EmployeeRoleId,
  EmployeeSessionSummary,
  EmployeeSummary,
  LoginResponse,
  RoleTemplate
};

type RoleListResponse = RoleTemplateListResponse;

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
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
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
      isActive: input.isActive
    })
  });
}
