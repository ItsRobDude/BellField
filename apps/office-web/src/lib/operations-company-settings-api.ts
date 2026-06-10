import type {
  CompanySettingsResponse,
  EstimateEmailDeliveryStatusResponse,
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

export async function getOfficeEstimateEmailDeliveryStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EstimateEmailDeliveryStatusResponse> {
  return requestJson<EstimateEmailDeliveryStatusResponse>(
    '/operations/company-settings/delivery-status',
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}
