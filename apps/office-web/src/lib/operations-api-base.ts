import { resolveOfficeApiBaseUrl } from './api-base-url';
import { notifyOfficeUnauthorized, officeSessionEndedMessage } from './office-session-events';

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
    throw await toRequestError(response);
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
    throw await toRequestError(response);
  }

  return response.blob();
}

// A 401 means the session itself is over, whichever call happened to notice first. Tell the
// auth shell so it can return to sign-in, and still throw so the caller's own error handling
// runs as before.
async function toRequestError(response: Response): Promise<Error> {
  const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;

  if (response.status === 401) {
    const message = errorBody?.message ?? officeSessionEndedMessage;
    notifyOfficeUnauthorized(message);
    return new Error(message);
  }

  return new Error(errorBody?.message ?? 'Request failed.');
}
