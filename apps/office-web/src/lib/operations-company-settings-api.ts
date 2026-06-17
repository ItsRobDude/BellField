import type {
  CompanySettingsResponse,
  EstimateEmailDeliveryStatusResponse,
  InvoiceNumberingSettingsResponse,
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

export async function getOfficeInvoiceNumbering(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceNumberingSettingsResponse> {
  return requestJson<InvoiceNumberingSettingsResponse>('/operations/invoice-numbering', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function updateOfficeInvoiceNumbering(input: {
  nextNumber: number;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceNumberingSettingsResponse> {
  return requestJson<InvoiceNumberingSettingsResponse>('/operations/invoice-numbering', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PUT',
    body: JSON.stringify({ nextNumber: input.nextNumber })
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
