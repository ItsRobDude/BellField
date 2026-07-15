import { ConflictException, NotFoundException } from '@nestjs/common';
import { setDraftInvoiceTaxRate } from './invoice-tax-rate-utils';
import type { QueryExecutor } from '../../database/database.service';

// Same scripted-queryable style as invoices.repository.spec.ts: match each query
// by an SQL fragment, record every call, assert exactly which writes happened.
function scriptedQueryable(
  handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryable: QueryExecutor = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const handler = handlers.find((h) => h.match.test(sql));
      return { rows: handler?.rows ?? [], rowCount: handler?.rowCount ?? 0 };
    }) as QueryExecutor['query']
  };
  return { queryable, calls };
}

function databaseServiceWith(
  handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>
) {
  const { queryable, calls } = scriptedQueryable(handlers);
  const databaseService = {
    query: queryable.query,
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never
  };
  return { databaseService: databaseService as never, calls };
}

const GUARDED_UPDATE = /update invoices set\s+tax_rate_basis_points[\s\S]*status = 'draft'/i;
const RECALC_HEADER = {
  match: /from invoices where id = \$1/i,
  rows: [
    { taxRateBasisPoints: 825, discountKind: null, discountBasisPoints: null, discountAmount: null }
  ]
};
const RECALC_LINES = {
  match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
  rows: [{ quantity: 1, unitPrice: 100, unitCost: null, taxable: true }]
};
const RECALC_WRITE = { match: /update invoices set\s+subtotal_amount/i, rowCount: 1 };
const TOUCH_JOB = { match: /update jobs set updated_at/i, rowCount: 1 };
const TIMELINE = { match: /insert into job_timeline_entries/i, rowCount: 1 };

describe('setDraftInvoiceTaxRate', () => {
  it('updates only a draft row, recomputes totals, and records a timeline entry', async () => {
    const { databaseService, calls } = databaseServiceWith([
      {
        match: GUARDED_UPDATE,
        rows: [{ jobId: 'job-1', invoiceKind: 'main' }],
        rowCount: 1
      },
      RECALC_HEADER,
      RECALC_LINES,
      RECALC_WRITE,
      TOUCH_JOB,
      TIMELINE
    ]);

    await setDraftInvoiceTaxRate(databaseService, 'inv-1', 825, 'Pat Office');

    const guarded = calls.find((c) => GUARDED_UPDATE.test(c.sql));
    expect(guarded).toBeDefined();
    expect(guarded?.sql).toMatch(/status = 'draft'/);
    expect(guarded?.params).toEqual(['inv-1', 825, expect.any(String)]);
    expect(calls.some((c) => /update invoices set\s+subtotal_amount/i.test(c.sql))).toBe(true);
    const timeline = calls.find((c) => /insert into job_timeline_entries/i.test(c.sql));
    expect(timeline).toBeDefined();
    expect(String(timeline?.params?.[4])).toBe('invoiceTaxRateChanged');
    expect(String(timeline?.params?.[5])).toContain('8.25%');
    expect(String(timeline?.params?.[5])).toContain('invoice draft');
  });

  it('labels adjustment drafts as adjustments in the timeline message', async () => {
    const { databaseService, calls } = databaseServiceWith([
      {
        match: GUARDED_UPDATE,
        rows: [{ jobId: 'job-1', invoiceKind: 'adjustment' }],
        rowCount: 1
      },
      RECALC_HEADER,
      RECALC_LINES,
      RECALC_WRITE,
      TOUCH_JOB,
      TIMELINE
    ]);

    await setDraftInvoiceTaxRate(databaseService, 'adj-1', 800, 'Pat Office');

    const timeline = calls.find((c) => /insert into job_timeline_entries/i.test(c.sql));
    expect(String(timeline?.params?.[5])).toContain('8%');
    expect(String(timeline?.params?.[5])).toContain('adjustment draft');
  });

  it('rejects a posted invoice with a conflict and never recomputes totals', async () => {
    const { databaseService, calls } = databaseServiceWith([
      { match: GUARDED_UPDATE, rows: [], rowCount: 0 },
      { match: /select status from invoices where id = \$1/i, rows: [{ status: 'posted' }] }
    ]);

    await expect(
      setDraftInvoiceTaxRate(databaseService, 'inv-posted', 825, 'Pat Office')
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls.some((c) => /update invoices set\s+subtotal_amount/i.test(c.sql))).toBe(false);
    expect(calls.some((c) => /insert into job_timeline_entries/i.test(c.sql))).toBe(false);
  });

  it('reports a missing invoice as not found', async () => {
    const { databaseService } = databaseServiceWith([
      { match: GUARDED_UPDATE, rows: [], rowCount: 0 },
      { match: /select status from invoices where id = \$1/i, rows: [] }
    ]);

    await expect(
      setDraftInvoiceTaxRate(databaseService, 'inv-missing', 825, 'Pat Office')
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
