export type EmployeeRoleId =
  | 'owner'
  | 'admin'
  | 'csr'
  | 'dispatcher'
  | 'bookKeeping'
  | 'technician';

export type PermissionKey =
  | `${'customers' | 'locations' | 'contacts' | 'equipment' | 'jobs' | 'appointmentsDispatch' | 'estimates' | 'invoices' | 'payments' | 'purchasing' | 'inventory' | 'reports' | 'employeesPermissions' | 'companySettings' | 'supportLogsBackups'}:${'view' | 'create' | 'edit' | 'delete' | 'approve' | 'post' | 'export' | 'configure'}`;

export type EmployeeSummary = {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  roleName: string;
  isActive: boolean;
  effectivePermissions: PermissionKey[];
  permissionOverrides: {
    grantedPermissions: PermissionKey[];
    revokedPermissions: PermissionKey[];
  };
};

export type RoleTemplate = {
  id: EmployeeRoleId;
  name: string;
  description: string;
  permissions: PermissionKey[];
};

export type LoginResponse = {
  sessionToken: string;
  employee: EmployeeSummary;
};

type EmployeeListResponse = {
  employees: EmployeeSummary[];
};

type RoleListResponse = {
  roles: RoleTemplate[];
};

type CurrentSessionResponse = {
  employee: EmployeeSummary;
};

const defaultApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl = defaultApiBaseUrl, headers, ...requestOptions } = options;
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
