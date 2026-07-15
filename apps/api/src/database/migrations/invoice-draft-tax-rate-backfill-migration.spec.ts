import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The backfill repairs the $0-tax drafts created before rate seeding existed.
// These assertions pin its safety envelope: drafts only, posted rows untouched,
// estimate-converted mains skipped, and SQL totals math only attempted for
// discount-free drafts that actually have active lines.
describe('20260715_001_invoice_draft_tax_rate_backfill migration', () => {
  const migrationSql = readFileSync(
    join(__dirname, '20260715_001_invoice_draft_tax_rate_backfill.up.sql'),
    'utf8'
  );
  const statements = migrationSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  const updates = statements.filter((s) => /update invoices/i.test(s));
  const [mainsWithLines, mainsEmpty, adjustmentsWithLines, adjustmentsEmpty] = updates;

  it('contains exactly the four draft updates (mains then adjustments, with-lines then empty)', () => {
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

  it('skips estimate-converted mains (adopted terms are deliberate, 0 may be a choice)', () => {
    expect(mainsWithLines).toMatch(/source_kind = 'estimate'/);
    expect(mainsWithLines).toMatch(/not exists/i);
  });

  it('only attempts SQL totals math on discount-free drafts with active lines', () => {
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

  it('avoids LATERAL against the update target (grouped derived table instead)', () => {
    expect(migrationSql).not.toMatch(/lateral/i);
    for (const update of [mainsWithLines, adjustmentsWithLines]) {
      expect(update).toMatch(/group by ili\.invoice_id/);
    }
  });

  it('seeds mains from company settings only when the company charges sales tax', () => {
    expect(mainsWithLines).toMatch(/charges_sales_tax then default_sales_tax_basis_points/);
    expect(mainsEmpty).toMatch(/charges_sales_tax then default_sales_tax_basis_points/);
    expect(mainsWithLines).toMatch(/cr\.bps > 0/);
    expect(mainsEmpty).toMatch(/cr\.bps > 0/);
  });

  it('inherits adjustment/credit rates from the corrected invoice, not company settings', () => {
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
});
