import { resolveFieldApiBaseUrl } from './api-base-url';

export type EmployeeSummary = {
  id: string;
  email: string;
  displayName: string;
  roleId: 'owner' | 'admin' | 'csr' | 'dispatcher' | 'bookKeeping' | 'technician';
  roleName: string;
  isActive: boolean;
  effectivePermissions: string[];
};

export type LoginResponse = {
  sessionToken: string;
  employee: EmployeeSummary;
};

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl, headers, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveFieldApiBaseUrl(apiBaseUrl);
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

export async function loginToFieldApi(input: {
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
      surface: 'field-mobile',
      deviceLabel: input.deviceLabel
    })
  });
}
