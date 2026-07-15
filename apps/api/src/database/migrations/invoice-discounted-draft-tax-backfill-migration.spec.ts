import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.BELLFIELD_API_DB_TEST_DATABASE_URL?.trim();
const canRunDbSpecs = Boolean(databaseUrl);

if (!canRunDbSpecs && process.env.CI === 'true') {
  throw new Error(
    'BELLFIELD_API_DB_TEST_DATABASE_URL must be set in CI so invoice migration SQL is exercised against PostgreSQL.'
  );
}

const describeDb = canRunDbSpecs ? describe : describe.skip;
const migrationSql = readFileSync(
  join(__dirname, '20260715_002_invoice_discounted_draft_tax_backfill.up.sql'),
  'utf8'
);
const rollbackSql = readFileSync(
  join(__dirname, '20260715_002_invoice_discounted_draft_tax_backfill.down.sql'),
  'utf8'
);

describe('20260715_002_invoice_discounted_draft_tax_backfill migration', () => {
  const sqlWithoutComments = stripSqlComments(migrationSql);
  const updates = sqlWithoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => /update invoices/i.test(statement));
  const [mainUpdate, correctionUpdate] = updates;

  it('contains only the discounted main and correction repair paths', () => {
    expect(updates).toHaveLength(2);
    expect(mainUpdate).toMatch(/invoice_kind = 'main'/);
    expect(correctionUpdate).toMatch(/invoice_kind in \('adjustment', 'credit'\)/);
    for (const update of updates) {
      expect(update).toMatch(/status = 'draft'/);
      expect(update).toMatch(/tax_rate_basis_points = 0/);
      expect(update).toMatch(/discount_kind is not null/);
      expect(update).toMatch(/exists \(/i);
    }
  });

  it('reuses the pricing engine taxable base and stored discount', () => {
    for (const update of updates) {
      expect(update).toMatch(/taxable_base_amount/);
      expect(update).toMatch(/discount_amount_applied/);
      expect(update).toMatch(/10000::numeric/);
      expect(update).not.toMatch(/sum\(/i);
      expect(update).toMatch(/version = \w+\.version \+ 1/);
    }
  });

  it('keeps the original source-of-rate safety boundaries', () => {
    expect(mainUpdate).toMatch(/charges_sales_tax then default_sales_tax_basis_points/);
    expect(mainUpdate).toMatch(/cr\.bps > 0/);
    expect(mainUpdate).toMatch(/source_kind = 'estimate'/);
    expect(mainUpdate).toMatch(/not exists/i);

    expect(correctionUpdate).toMatch(/parent\.id = adj\.adjusts_invoice_id/);
    expect(correctionUpdate).toMatch(/parent\.tax_rate_basis_points > 0/);
    expect(correctionUpdate).not.toMatch(/company_settings/);
  });

  it('provides an explicit non-destructive rollback', () => {
    expect(rollbackSql).toMatch(/intentionally non-destructive rollback/i);
    expect(stripSqlComments(rollbackSql).trim()).toBe('select 1;');
  });
});

describeDb('20260715_002 discounted invoice backfill with PostgreSQL', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      create temp table company_settings (
        charges_sales_tax boolean not null,
        default_sales_tax_basis_points integer not null
      );

      create temp table invoices (
        id text primary key,
        invoice_kind text not null,
        status text not null,
        tax_rate_basis_points integer not null,
        discount_kind text,
        discount_amount_applied numeric(14, 2) not null,
        taxable_base_amount numeric(14, 2) not null,
        tax_amount numeric(14, 2) not null,
        subtotal_amount numeric(14, 2) not null,
        total_amount numeric(14, 2) not null,
        updated_at timestamptz not null default now(),
        version integer not null,
        adjusts_invoice_id text
      );

      create temp table invoice_line_items (
        invoice_id text not null,
        taxable boolean not null,
        line_subtotal_amount numeric(14, 2) not null,
        is_void boolean not null,
        source_kind text not null
      );
    `);
  });

  beforeEach(async () => {
    await client.query('truncate table invoice_line_items, invoices, company_settings');
  });

  afterAll(async () => {
    await client?.end();
  });

  it('repairs a discounted manual main using its discount-adjusted taxable base', async () => {
    await client.query('insert into company_settings values (true, 825)');
    await client.query(
      `insert into invoices (
        id, invoice_kind, status, tax_rate_basis_points, discount_kind,
        discount_amount_applied, taxable_base_amount, tax_amount,
        subtotal_amount, total_amount, version
      ) values ('main-draft', 'main', 'draft', 0, 'percent', 20, 90, 0, 200, 180, 4)`
    );
    await client.query(
      `insert into invoice_line_items
        (invoice_id, taxable, line_subtotal_amount, is_void, source_kind)
       values ('main-draft', true, 100, false, 'manual')`
    );

    await client.query(migrationSql);

    await expect(readBackfillResult(client, 'main-draft')).resolves.toEqual({
      taxRateBasisPoints: 825,
      discountAmountApplied: 20,
      taxableBaseAmount: 90,
      taxAmount: 7.43,
      totalAmount: 187.43,
      version: 5
    });
  });

  it('repairs a discounted adjustment using the posted parent rate', async () => {
    await client.query('insert into company_settings values (true, 825)');
    await client.query(
      `insert into invoices (
        id, invoice_kind, status, tax_rate_basis_points, discount_kind,
        discount_amount_applied, taxable_base_amount, tax_amount,
        subtotal_amount, total_amount, version
      ) values ('posted-parent', 'main', 'posted', 700, null, 0, 100, 7, 100, 107, 3)`
    );
    await client.query(
      `insert into invoices (
        id, invoice_kind, status, tax_rate_basis_points, discount_kind,
        discount_amount_applied, taxable_base_amount, tax_amount,
        subtotal_amount, total_amount, version, adjusts_invoice_id
      ) values (
        'adjustment-draft', 'adjustment', 'draft', 0, 'fixed', 10, 45, 0, 100, 90, 7,
        'posted-parent'
      )`
    );
    await client.query(
      `insert into invoice_line_items
        (invoice_id, taxable, line_subtotal_amount, is_void, source_kind)
       values ('adjustment-draft', true, 50, false, 'manual')`
    );

    await client.query(migrationSql);

    await expect(readBackfillResult(client, 'adjustment-draft')).resolves.toEqual({
      taxRateBasisPoints: 700,
      discountAmountApplied: 10,
      taxableBaseAmount: 45,
      taxAmount: 3.15,
      totalAmount: 93.15,
      version: 8
    });
  });
});

function stripSqlComments(sql: string) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

async function readBackfillResult(client: Client, invoiceId: string) {
  const result = await client.query<{
    taxRateBasisPoints: number;
    discountAmountApplied: string;
    taxableBaseAmount: string;
    taxAmount: string;
    totalAmount: string;
    version: number;
  }>(
    `select
       tax_rate_basis_points as "taxRateBasisPoints",
       discount_amount_applied as "discountAmountApplied",
       taxable_base_amount as "taxableBaseAmount",
       tax_amount as "taxAmount",
       total_amount as "totalAmount",
       version
     from invoices
     where id = $1`,
    [invoiceId]
  );
  const row = result.rows[0];

  return {
    taxRateBasisPoints: row.taxRateBasisPoints,
    discountAmountApplied: Number(row.discountAmountApplied),
    taxableBaseAmount: Number(row.taxableBaseAmount),
    taxAmount: Number(row.taxAmount),
    totalAmount: Number(row.totalAmount),
    version: row.version
  };
}
