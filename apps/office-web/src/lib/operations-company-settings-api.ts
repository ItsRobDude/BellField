import type {
  CompanySettingsResponse,
  EmailProviderSecretResponse,
  UpdateCompanySettingsRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export async function getOfficeCompanySettings(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CompanySettingsResponse> {
  return requestJson<CompanySettingsResponse>('/operations/company-settings', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function updateOfficeCompanySettings(
  input: UpdateCompanySettingsRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<CompanySettingsResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;
  return requestJson<CompanySettingsResponse>('/operations/company-settings', {
    apiBaseUrl,
    sessionToken,
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeEmailProviderSecret(input: {
  provider: 'resend';
  apiKey: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EmailProviderSecretResponse> {
  const { sessionToken, apiBaseUrl, provider, apiKey } = input;
  return requestJson<EmailProviderSecretResponse>(
    '/operations/company-settings/email-provider-secret',
    {
      apiBaseUrl,
      sessionToken,
      method: 'PUT',
      body: JSON.stringify({ provider, apiKey })
    }
  );
}
