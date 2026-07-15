import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The original backfill repairs the $0-tax drafts created before rate seeding
// existed. Keep its committed forward SQL immutable; the follow-up migration
// owns the discounted-with-lines repair for databases that already applied it.
describe('20260715_001_invoice_draft_tax_rate_backfill migration', () => {
  const migrationSql = readFileSync(
    join(__dirname, '20260715_001_invoice_draft_tax_rate_backfill.up.sql'),
    'utf8'
  );
  const rollbackSql = readFileSync(
    join(__dirname, '20260715_001_invoice_draft_tax_rate_backfill.down.sql'),
    'utf8'
  );
  // Strip comment lines BEFORE splitting on ';' — the prose comments contain
  // semicolons and SQL keywords that would otherwise corrupt the statement list.
  const sqlWithoutComments = migrationSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = sqlWithoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  const updates = statements.filter((statement) => /update invoices/i.test(statement));
  const [mainsWithLines, mainsEmpty, adjustmentsWithLines, adjustmentsEmpty] = updates;

  it('contains exactly the four original draft update paths', () => {
    expect(updates).toHaveLength(4);
    expect(mainsWithLines).toMatch(/invoice_kind = 'main'/);
    expect(mainsEmpty).toMatch(/invoice_kind = 'main'/);
    expect(adjustmentsWithLines).toMatch(/invoice_kind in \('adjustment', 'credit'\)/);
    expect(adjustmentsEmpty).toMatch(/invoice_kind in \('adjustment', 'credit'\)/);
  });

  it('never touches posted invoices or drafts that already carry a rate', () => {
    for (const update of updates) {
      expect(update).toMatch(/status = 'draft'/);
      expect(update).toMatch(/tax_rate_basis_points = 0/);
    }
  });

  it('skips estimate-converted mains', () => {
    expect(mainsWithLines).toMatch(/source_kind = 'estimate'/);
    expect(mainsWithLines).toMatch(/not exists/i);
  });

  it('limits original SQL totals math to discount-free drafts with active lines', () => {
    for (const update of [mainsWithLines, adjustmentsWithLines]) {
      expect(update).toMatch(/discount_kind is null/);
      expect(update).toMatch(/round\(t\.taxable_base \* /);
      expect(update).toMatch(/10000::numeric/);
      expect(update).not.toMatch(/10000\.0/);
    }
    for (const update of [mainsEmpty, adjustmentsEmpty]) {
      expect(update).not.toMatch(/tax_amount/);
      expect(update).not.toMatch(/total_amount/);
      expect(update).toMatch(/not exists/i);
    }
  });

  it('avoids LATERAL against the update target', () => {
    expect(sqlWithoutComments).not.toMatch(/lateral/i);
    for (const update of [mainsWithLines, adjustmentsWithLines]) {
      expect(update).toMatch(/group by ili\.invoice_id/);
    }
  });

  it('uses the company rate for mains and the frozen parent rate for corrections', () => {
    for (const update of [mainsWithLines, mainsEmpty]) {
      expect(update).toMatch(/charges_sales_tax then default_sales_tax_basis_points/);
      expect(update).toMatch(/cr\.bps > 0/);
    }
    for (const update of [adjustmentsWithLines, adjustmentsEmpty]) {
      expect(update).toMatch(/parent\.id = adj\.adjusts_invoice_id/);
      expect(update).toMatch(/parent\.tax_rate_basis_points > 0/);
      expect(update).not.toMatch(/company_settings/);
    }
  });

  it('bumps the row version on every update path', () => {
    for (const update of updates) {
      expect(update).toMatch(/version = \w+\.version \+ 1/);
    }
  });

  it('provides an explicit non-destructive rollback for the data repair', () => {
    const rollbackWithoutComments = rollbackSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();

    expect(rollbackSql).toMatch(/intentionally non-destructive rollback/i);
    expect(rollbackWithoutComments).toBe('select 1;');
  });
});
