import type {
  CompanySettings,
  CompanySettingsResponse,
  EmailProviderKey,
  EmailProviderSecretResponse,
  EmailProviderStatus,
  UpdateCompanySettingsRequest,
  UpdateEmailProviderSecretRequest
} from '@bellfield/contracts';

export type CompanySettingsDto = CompanySettings;
export type CompanySettingsResponseDto = CompanySettingsResponse;
export type EmailProviderKeyValue = EmailProviderKey;
export type EmailProviderStatusDto = EmailProviderStatus;
export type EmailProviderSecretResponseDto = EmailProviderSecretResponse;
export type UpdateCompanySettingsRequestDto = UpdateCompanySettingsRequest;
export type UpdateEmailProviderSecretRequestDto = UpdateEmailProviderSecretRequest;

export type EncryptedSecretRecord = {
  encryptedValue: string;
  iv: string;
  authTag: string;
};

export type StoredIntegrationSecret = EncryptedSecretRecord & {
  provider: EmailProviderKeyValue;
  purpose: 'email';
  lastConfiguredAt: string;
  lastConfiguredByName?: string;
};
