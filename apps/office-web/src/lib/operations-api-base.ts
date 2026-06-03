import { resolveOfficeApiBaseUrl } from './api-base-url';

// Shared office API fetch wrappers. Domain client modules (operations-api and the per-area
// inventory/purchasing/job-costing files) import these so the auth-header + error handling
// live in one place.

export async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return (await response.json()) as TResponse;
}

export async function requestBlob(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken?: string } = {}
): Promise<Blob> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return response.blob();
}
