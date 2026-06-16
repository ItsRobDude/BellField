import { CompanySettingsRepository } from './company-settings.repository';
import { defaultCompanySettings } from './company-settings.defaults';
import type { UpdateCompanySettingsRequestDto } from './company-settings.types';

// The upsert binds 16 positional params across 18 columns (created_at/updated_at
// reuse $16). The service spec mocks this repository, so without this round-trip
// a column<->param desync — e.g. invoice_email_subject pointed at the wrong $N —
// would slip through typecheck and unit tests and only surface as silently
// corrupted saved settings. These tests pin the mapping in both directions.

type Call = { sql: string; params: unknown[] };

function scriptedDb(rowsForSelect: unknown[]) {
  const calls: Call[] = [];
  const databaseService = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/from company_settings/i.test(sql)) {
        return { rows: rowsForSelect, rowCount: rowsForSelect.length };
      }
      return { rows: [], rowCount: 0 };
    }) as never
  };
  return { repository: new CompanySettingsRepository(databaseService as never), calls };
}

// Resolve the INSERT into a column -> bound-value map by reading the column list
// and the positional VALUES list straight from the SQL, so the assertion fails
// if either the column order or the param order drifts.
function resolveUpsertColumns(call: Call): Record<string, unknown> {
  const columnMatch = /insert into company_settings\s*\(([\s\S]*?)\)\s*values/i.exec(call.sql);
  const valuesMatch = /values\s*\(([\s\S]*?)\)\s*on conflict/i.exec(call.sql);
  if (!columnMatch || !valuesMatch) {
    throw new Error('Could not parse the company_settings upsert statement.');
  }
  const columns = columnMatch[1]
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  const values = valuesMatch[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  expect(values).toHaveLength(columns.length);

  const mapping: Record<string, unknown> = {};
  values.forEach((value, index) => {
    const column = columns[index];
    if (value === "'default'") {
      mapping[column] = 'default';
      return;
    }
    const positional = /^\$(\d+)$/.exec(value);
    if (!positional) {
      throw new Error(`Unexpected value expression in upsert: ${value}`);
    }
    mapping[column] = call.params[Number(positional[1]) - 1];
  });
  return mapping;
}

function findUpsertCall(calls: Call[]): Call {
  const call = calls.find((entry) => /insert into company_settings/i.test(entry.sql));
  if (!call) {
    throw new Error('Expected an upsert query.');
  }
  return call;
}

const actor = { id: 'employee-1', displayName: 'Olivia Owner' };

const input: UpdateCompanySettingsRequestDto = {
  companyName: 'Acme HVAC',
  replyToEmail: 'office@acme.example',
  estimateEmailSubject: 'EST-SUBJECT',
  estimateEmailBody: 'EST-BODY',
  invoiceEmailSubject: 'INV-SUBJECT',
  invoiceEmailBody: 'INV-BODY',
  acceptanceLinkExpiryDays: 45,
  chargesSalesTax: true,
  defaultSalesTaxBasisPoints: 825,
  includeInvoicePaymentLink: true,
  sendPaymentReceipts: true,
  paymentReceiptEmailSubject: 'PMT-RCPT-SUBJECT',
  paymentReceiptEmailBody: 'PMT-RCPT-BODY'
};

// Distinct sentinel per column so a SELECT mis-mapping is visible.
const row = {
  companyName: 'row-company',
  replyToEmail: 'row-reply@acme.example',
  estimateEmailSubject: 'row-est-subject',
  estimateEmailBody: 'row-est-body',
  invoiceEmailSubject: 'row-inv-subject',
  invoiceEmailBody: 'row-inv-body',
  acceptanceLinkExpiryDays: 21,
  chargesSalesTax: true,
  defaultSalesTaxBasisPoints: 600,
  includeInvoicePaymentLink: true,
  sendPaymentReceipts: false,
  paymentReceiptEmailSubject: 'row-pmt-rcpt-subject',
  paymentReceiptEmailBody: 'row-pmt-rcpt-body',
  updatedByName: 'row-actor',
  updatedAt: '2026-06-14T12:00:00.000Z'
};

describe('CompanySettingsRepository', () => {
  it('binds every upsert column to its matching value', async () => {
    const { repository, calls } = scriptedDb([row]);

    await repository.upsertSettings(input, actor);

    const mapping = resolveUpsertColumns(findUpsertCall(calls));
    expect(mapping).toMatchObject({
      id: 'default',
      company_name: input.companyName,
      reply_to_email: input.replyToEmail,
      estimate_email_subject: input.estimateEmailSubject,
      estimate_email_body: input.estimateEmailBody,
      invoice_email_subject: input.invoiceEmailSubject,
      invoice_email_body: input.invoiceEmailBody,
      acceptance_link_expiry_days: input.acceptanceLinkExpiryDays,
      charges_sales_tax: input.chargesSalesTax,
      default_sales_tax_basis_points: input.defaultSalesTaxBasisPoints,
      include_invoice_payment_link: input.includeInvoicePaymentLink,
      send_payment_receipts: input.sendPaymentReceipts,
      payment_receipt_email_subject: input.paymentReceiptEmailSubject,
      payment_receipt_email_body: input.paymentReceiptEmailBody,
      updated_by_employee_id: actor.id,
      updated_by_name: actor.displayName
    });
    // created_at and updated_at share the same bound timestamp ($13).
    expect(typeof mapping.updated_at).toBe('string');
    expect(mapping.created_at).toBe(mapping.updated_at);
  });

  it('stores null when the reply-to email is omitted', async () => {
    const { repository, calls } = scriptedDb([row]);

    await repository.upsertSettings({ ...input, replyToEmail: undefined }, actor);

    expect(resolveUpsertColumns(findUpsertCall(calls)).reply_to_email).toBeNull();
  });

  it('maps every selected row column to the settings field', async () => {
    const { repository } = scriptedDb([row]);

    const settings = await repository.getSettings();

    expect(settings).toEqual({
      companyName: 'row-company',
      replyToEmail: 'row-reply@acme.example',
      estimateEmailSubject: 'row-est-subject',
      estimateEmailBody: 'row-est-body',
      invoiceEmailSubject: 'row-inv-subject',
      invoiceEmailBody: 'row-inv-body',
      acceptanceLinkExpiryDays: 21,
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 600,
      includeInvoicePaymentLink: true,
      sendPaymentReceipts: false,
      paymentReceiptEmailSubject: 'row-pmt-rcpt-subject',
      paymentReceiptEmailBody: 'row-pmt-rcpt-body',
      updatedAt: '2026-06-14T12:00:00.000Z',
      updatedByName: 'row-actor'
    });
  });

  it('returns defaults when no settings row exists', async () => {
    const { repository } = scriptedDb([]);

    expect(await repository.getSettings()).toBe(defaultCompanySettings);
  });
});
