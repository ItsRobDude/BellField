export type EmailProviderKey = 'resend';

export interface EmailProviderStatus {
  provider: EmailProviderKey;
  configured: boolean;
  lastConfiguredAt?: string;
  lastConfiguredByName?: string;
}

export interface CompanySettings {
  companyName: string;
  customerFacingSenderName: string;
  customerFacingFromEmail: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  emailProvider: EmailProviderStatus;
  updatedAt?: string;
  updatedByName?: string;
}

export interface CompanySettingsResponse {
  settings: CompanySettings;
}

export interface UpdateCompanySettingsRequest {
  companyName: string;
  customerFacingSenderName: string;
  customerFacingFromEmail: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
}

export interface UpdateEmailProviderSecretRequest {
  provider: EmailProviderKey;
  apiKey: string;
}

export interface EmailProviderSecretResponse {
  emailProvider: EmailProviderStatus;
}
