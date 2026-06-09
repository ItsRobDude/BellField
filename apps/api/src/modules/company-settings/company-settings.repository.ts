import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { defaultCompanySettings } from './company-settings.defaults';
import type {
  CompanySettingsDto,
  EmailProviderKeyValue,
  EmailProviderStatusDto,
  EncryptedSecretRecord,
  StoredIntegrationSecret,
  UpdateCompanySettingsRequestDto
} from './company-settings.types';

type CompanySettingsRow = {
  companyName: string;
  customerFacingSenderName: string;
  customerFacingFromEmail: string;
  replyToEmail: string | null;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  updatedByName: string | null;
  updatedAt: string | Date;
};

type IntegrationSecretRow = {
  provider: EmailProviderKeyValue;
  purpose: 'email';
  encryptedValue: string;
  iv: string;
  authTag: string;
  lastConfiguredAt: string | Date;
  lastConfiguredByName: string | null;
};

@Injectable()
export class CompanySettingsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSettings(): Promise<CompanySettingsDto> {
    const result = await this.databaseService.query<CompanySettingsRow>(
      `
        select
          company_name as "companyName",
          customer_facing_sender_name as "customerFacingSenderName",
          customer_facing_from_email as "customerFacingFromEmail",
          reply_to_email as "replyToEmail",
          estimate_email_subject as "estimateEmailSubject",
          estimate_email_body as "estimateEmailBody",
          updated_by_name as "updatedByName",
          updated_at as "updatedAt"
        from company_settings
        where id = 'default'
        limit 1
      `
    );
    const emailProvider = await this.getEmailProviderStatus('resend');
    const row = result.rows[0];
    if (!row) {
      return { ...defaultCompanySettings, emailProvider };
    }

    return {
      companyName: row.companyName,
      customerFacingSenderName: row.customerFacingSenderName,
      customerFacingFromEmail: row.customerFacingFromEmail,
      replyToEmail: row.replyToEmail ?? undefined,
      estimateEmailSubject: row.estimateEmailSubject,
      estimateEmailBody: row.estimateEmailBody,
      emailProvider,
      updatedAt: toIsoString(row.updatedAt),
      updatedByName: row.updatedByName ?? undefined
    };
  }

  async upsertSettings(
    input: UpdateCompanySettingsRequestDto,
    actor: { id: string; displayName: string }
  ): Promise<CompanySettingsDto> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `
        insert into company_settings (
          id, company_name, customer_facing_sender_name, customer_facing_from_email,
          reply_to_email, estimate_email_subject, estimate_email_body,
          updated_by_employee_id, updated_by_name, created_at, updated_at
        )
        values ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        on conflict (id) do update set
          company_name = excluded.company_name,
          customer_facing_sender_name = excluded.customer_facing_sender_name,
          customer_facing_from_email = excluded.customer_facing_from_email,
          reply_to_email = excluded.reply_to_email,
          estimate_email_subject = excluded.estimate_email_subject,
          estimate_email_body = excluded.estimate_email_body,
          updated_by_employee_id = excluded.updated_by_employee_id,
          updated_by_name = excluded.updated_by_name,
          updated_at = excluded.updated_at
      `,
      [
        input.companyName,
        input.customerFacingSenderName,
        input.customerFacingFromEmail,
        input.replyToEmail ?? null,
        input.estimateEmailSubject,
        input.estimateEmailBody,
        actor.id,
        actor.displayName,
        now
      ]
    );

    return this.getSettings();
  }

  async upsertEmailProviderSecret(
    provider: EmailProviderKeyValue,
    encryptedSecret: EncryptedSecretRecord,
    actor: { id: string; displayName: string }
  ): Promise<EmailProviderStatusDto> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `
        insert into integration_secrets (
          id, provider, purpose, encrypted_value, iv, auth_tag,
          last_configured_by_employee_id, last_configured_by_name,
          last_configured_at, created_at, updated_at
        )
        values ($1, $2, 'email', $3, $4, $5, $6, $7, $8, $8, $8)
        on conflict (provider, purpose) do update set
          encrypted_value = excluded.encrypted_value,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          last_configured_by_employee_id = excluded.last_configured_by_employee_id,
          last_configured_by_name = excluded.last_configured_by_name,
          last_configured_at = excluded.last_configured_at,
          updated_at = excluded.updated_at
      `,
      [
        `${provider}-email`,
        provider,
        encryptedSecret.encryptedValue,
        encryptedSecret.iv,
        encryptedSecret.authTag,
        actor.id,
        actor.displayName,
        now
      ]
    );
    return this.getEmailProviderStatus(provider);
  }

  async getEmailProviderSecret(
    provider: EmailProviderKeyValue
  ): Promise<StoredIntegrationSecret | null> {
    const result = await this.databaseService.query<IntegrationSecretRow>(
      `
        select
          provider,
          purpose,
          encrypted_value as "encryptedValue",
          iv,
          auth_tag as "authTag",
          last_configured_at as "lastConfiguredAt",
          last_configured_by_name as "lastConfiguredByName"
        from integration_secrets
        where provider = $1 and purpose = 'email'
        limit 1
      `,
      [provider]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      provider: row.provider,
      purpose: row.purpose,
      encryptedValue: row.encryptedValue,
      iv: row.iv,
      authTag: row.authTag,
      lastConfiguredAt: toIsoString(row.lastConfiguredAt),
      lastConfiguredByName: row.lastConfiguredByName ?? undefined
    };
  }

  private async getEmailProviderStatus(
    provider: EmailProviderKeyValue
  ): Promise<EmailProviderStatusDto> {
    const secret = await this.getEmailProviderSecret(provider);
    return {
      provider,
      configured: Boolean(secret),
      lastConfiguredAt: secret?.lastConfiguredAt,
      lastConfiguredByName: secret?.lastConfiguredByName
    };
  }
}
