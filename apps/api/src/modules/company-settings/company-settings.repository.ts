import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { defaultCompanySettings } from './company-settings.defaults';
import type { CompanySettingsDto, UpdateCompanySettingsRequestDto } from './company-settings.types';

type CompanySettingsRow = {
  companyName: string;
  replyToEmail: string | null;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
  updatedByName: string | null;
  updatedAt: string | Date;
};

@Injectable()
export class CompanySettingsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSettings(): Promise<CompanySettingsDto> {
    const result = await this.databaseService.query<CompanySettingsRow>(
      `
        select
          company_name as "companyName",
          reply_to_email as "replyToEmail",
          estimate_email_subject as "estimateEmailSubject",
          estimate_email_body as "estimateEmailBody",
          charges_sales_tax as "chargesSalesTax",
          default_sales_tax_basis_points as "defaultSalesTaxBasisPoints",
          updated_by_name as "updatedByName",
          updated_at as "updatedAt"
        from company_settings
        where id = 'default'
        limit 1
      `
    );
    const row = result.rows[0];
    if (!row) {
      return defaultCompanySettings;
    }

    return {
      companyName: row.companyName,
      replyToEmail: row.replyToEmail ?? undefined,
      estimateEmailSubject: row.estimateEmailSubject,
      estimateEmailBody: row.estimateEmailBody,
      chargesSalesTax: row.chargesSalesTax,
      defaultSalesTaxBasisPoints: row.defaultSalesTaxBasisPoints,
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
          id, company_name, reply_to_email, estimate_email_subject, estimate_email_body,
          charges_sales_tax, default_sales_tax_basis_points,
          updated_by_employee_id, updated_by_name, created_at, updated_at
        )
        values ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        on conflict (id) do update set
          company_name = excluded.company_name,
          reply_to_email = excluded.reply_to_email,
          estimate_email_subject = excluded.estimate_email_subject,
          estimate_email_body = excluded.estimate_email_body,
          charges_sales_tax = excluded.charges_sales_tax,
          default_sales_tax_basis_points = excluded.default_sales_tax_basis_points,
          updated_by_employee_id = excluded.updated_by_employee_id,
          updated_by_name = excluded.updated_by_name,
          updated_at = excluded.updated_at
      `,
      [
        input.companyName,
        input.replyToEmail ?? null,
        input.estimateEmailSubject,
        input.estimateEmailBody,
        input.chargesSalesTax,
        input.defaultSalesTaxBasisPoints,
        actor.id,
        actor.displayName,
        now
      ]
    );

    return this.getSettings();
  }
}
