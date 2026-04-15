const localDevelopmentApiBaseUrl = 'http://localhost:3001';

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, '');
}

export function getInitialOfficeApiBaseUrl(): string {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredApiBaseUrl) {
    return normalizeApiBaseUrl(configuredApiBaseUrl);
  }

  return process.env.NODE_ENV === 'production' ? '' : localDevelopmentApiBaseUrl;
}

export function resolveOfficeApiBaseUrl(apiBaseUrl?: string): string {
  const explicitApiBaseUrl = apiBaseUrl?.trim();

  if (explicitApiBaseUrl) {
    return normalizeApiBaseUrl(explicitApiBaseUrl);
  }

  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredApiBaseUrl) {
    return normalizeApiBaseUrl(configuredApiBaseUrl);
  }

  if (process.env.NODE_ENV !== 'production') {
    return localDevelopmentApiBaseUrl;
  }

  throw new Error(
    'BellField Office needs a server URL. Set NEXT_PUBLIC_API_BASE_URL or enter the office server URL before signing in.'
  );
}
