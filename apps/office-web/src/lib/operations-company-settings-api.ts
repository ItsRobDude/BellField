import type {
  CompanySettingsResponse,
  EstimateEmailDeliveryStatusResponse,
  InvoiceNumberingSettingsResponse,
  OnlinePaymentsSetupLinkResponse,
  OnlinePaymentsSetupStatusResponse,
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

export async function getOfficeOnlinePaymentsSetupStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<OnlinePaymentsSetupStatusResponse> {
  return requestJson<OnlinePaymentsSetupStatusResponse>(
    '/operations/company-settings/payments/setup-status',
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function createOfficeOnlinePaymentsSetupLink(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<OnlinePaymentsSetupLinkResponse> {
  return requestJson<OnlinePaymentsSetupLinkResponse>(
    '/operations/company-settings/payments/setup-link',
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST'
    }
  );
}

export async function refreshOfficeOnlinePaymentsSetupLink(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<OnlinePaymentsSetupLinkResponse> {
  return requestJson<OnlinePaymentsSetupLinkResponse>(
    '/operations/company-settings/payments/setup-refresh',
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST'
    }
  );
}
