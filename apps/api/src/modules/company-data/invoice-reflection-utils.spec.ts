import type { BillingProjectionState } from '@bellfield/contracts';
import {
  reflectRegisterEntryCreate,
  reflectRegisterEntryUpdate,
  reflectRegisterEntryVoid
} from './invoice-reflection-utils';
import type { QueryExecutor } from '../../database/database.service';

// A tiny scripted queryable: each query is matched by a fragment of its SQL and
// returns a canned result, while every call is recorded for assertions.
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

function findCall(calls: Array<{ sql: string; params: unknown[] }>, fragment: RegExp) {
  return calls.find((c) => fragment.test(c.sql));
}

const INVOICE_CTX = /select id, status from invoices/i;
const NEXT_POS = /coalesce\(max\(line_position\)/i;
const HAS_LINKED = /select 1 from invoice_line_items[\s\S]*source_sync_state = 'linked'/i;
const HAS_ANY =
  /select 1 from invoice_line_items\s+where source_register_entry_id = \$1 and is_void = false/i;
const LINE_INSERT = /insert into invoice_line_items/i;
const LINE_UPDATE = /update invoice_line_items set\s+kind =/i;
const LINE_VOID = /update invoice_line_items set\s+is_void = true/i;
const TOTALS = /update invoices set/i;
const NOTE = /insert into job_timeline_entries/i;

const draftContext = { match: INVOICE_CTX, rows: [{ id: 'inv-1', status: 'draft' }] };
const postedContext = { match: INVOICE_CTX, rows: [{ id: 'inv-1', status: 'posted' }] };
const pricingHeader = {
  match: /from invoices where id =/i,
  rows: [
    { taxRateBasisPoints: 0, discountKind: null, discountBasisPoints: null, discountAmount: null }
  ]
};
const emptyLineList = {
  match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
  rows: []
};

function billableEntry(
  overrides: Partial<{
    id: string;
    jobId: string;
    kind: string;
    description: string;
    totalAmount: number;
    billingProjectionState: BillingProjectionState;
  }> = {}
) {
  return {
    id: 're-1',
    jobId: 'job-1',
    kind: 'part',
    description: 'Contactor',
    totalAmount: 125,
    billingProjectionState: 'billable' as BillingProjectionState,
    ...overrides
  };
}

describe('invoice reflection utils — draft invoice', () => {
  it('reflects a billable register create as a quantity-1 linked line at the register total', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: NEXT_POS, rows: [{ nextPosition: 2 }] },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryCreate(
      'job-1',
      billableEntry(),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    // The invoice row is locked FOR UPDATE before any line write (posted-lock race guard).
    expect(findCall(calls, INVOICE_CTX)?.sql).toMatch(/for update/i);
    const insert = findCall(calls, LINE_INSERT);
    expect(insert).toBeDefined();
    expect(insert?.params[6]).toBe(125); // unit_price = register total
    expect(insert?.params).toContain('re-1');
    expect(insert?.sql).toMatch(/'register'/);
    expect(insert?.sql).toMatch(/values \(\$1, \$2, \$3, \$4, \$5, 1,/);
    expect(findCall(calls, TOTALS)).toBeDefined();
  });

  it('reflects a no-charge register create as a $0 line so the customer still sees the work', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: NEXT_POS, rows: [{ nextPosition: 0 }] },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryCreate(
      'job-1',
      billableEntry({ billingProjectionState: 'noChargeShown' }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const insert = findCall(calls, LINE_INSERT);
    expect(insert).toBeDefined();
    expect(insert?.params[6]).toBe(0); // unit_price = 0 (no charge), not the register total
    expect(findCall(calls, TOTALS)).toBeDefined();
  });

  it('reflects nothing for an internal-only register create (no customer line, no invoice read)', async () => {
    const { queryable, calls } = scriptedQueryable([draftContext]);

    await reflectRegisterEntryCreate(
      'job-1',
      billableEntry({ billingProjectionState: 'internalOnly' }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, INVOICE_CTX)).toBeUndefined();
    expect(findCall(calls, LINE_INSERT)).toBeUndefined();
    expect(findCall(calls, TOTALS)).toBeUndefined();
  });

  it('updates the linked invoice line for a billable edit and recomputes', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: HAS_LINKED, rowCount: 1, rows: [{ x: 1 }] },
      { match: LINE_UPDATE, rowCount: 1 },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1', description: 'New', totalAmount: 95 }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const update = findCall(calls, LINE_UPDATE);
    expect(update?.sql).toMatch(/source_sync_state = 'linked'/);
    expect(update?.params[4]).toBe(95); // unit_price = register total (billable)
    expect(findCall(calls, TOTALS)).toBeDefined();
  });

  it('voids the linked line when a billable line transitions to internal-only', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: HAS_LINKED, rowCount: 1, rows: [{ x: 1 }] },
      { match: LINE_VOID, rowCount: 1 },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1', billingProjectionState: 'internalOnly' }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const voidCall = findCall(calls, LINE_VOID);
    expect(voidCall?.sql).toMatch(/no longer bills/i);
    expect(findCall(calls, LINE_UPDATE)).toBeUndefined();
    expect(findCall(calls, TOTALS)).toBeDefined();
  });

  it('creates a line when an internal-only line transitions to billable (no line yet)', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: HAS_LINKED, rowCount: 0 },
      { match: HAS_ANY, rowCount: 0 },
      { match: NEXT_POS, rows: [{ nextPosition: 0 }] },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1' }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_INSERT)).toBeDefined();
    expect(findCall(calls, TOTALS)).toBeDefined();
  });

  it('leaves an office-detached line alone (no create, no void, no recompute)', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: HAS_LINKED, rowCount: 0 },
      { match: HAS_ANY, rowCount: 1, rows: [{ x: 1 }] }
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1', description: 'New', totalAmount: 95 }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_INSERT)).toBeUndefined();
    expect(findCall(calls, LINE_VOID)).toBeUndefined();
    expect(findCall(calls, TOTALS)).toBeUndefined();
  });

  it('voids the linked invoice line on a register void and recomputes', async () => {
    const { queryable, calls } = scriptedQueryable([
      draftContext,
      { match: LINE_VOID, rowCount: 1 },
      pricingHeader,
      emptyLineList
    ]);

    await reflectRegisterEntryVoid(
      're-1',
      'job-1',
      'Contactor',
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const voidCall = findCall(calls, LINE_VOID);
    expect(voidCall?.sql).toMatch(/source_sync_state = 'linked'/);
    expect(findCall(calls, TOTALS)).toBeDefined();
  });
});

describe('invoice reflection utils — posted (locked) invoice', () => {
  it('does not touch a posted invoice on create and records a not-reflected note', async () => {
    const { queryable, calls } = scriptedQueryable([postedContext]);

    await reflectRegisterEntryCreate(
      'job-1',
      billableEntry({ description: 'Late part' }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_INSERT)).toBeUndefined();
    expect(findCall(calls, TOTALS)).toBeUndefined();
    const note = findCall(calls, NOTE);
    expect(note?.params).toContain('registerEntryNotReflected');
    expect(note?.params).toContain('Tech Tina');
  });

  it('drops a posted-invoice register edit but notes it when a linked line existed', async () => {
    const { queryable, calls } = scriptedQueryable([
      postedContext,
      { match: /select 1 from invoice_line_items/i, rowCount: 1, rows: [{ exists: 1 }] }
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1', description: 'Edited', totalAmount: 95 }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_UPDATE)).toBeUndefined();
    const note = findCall(calls, NOTE);
    expect(note?.params).toContain('registerEntryNotReflected');
  });

  it('drops a posted-invoice register edit silently when no linked line existed', async () => {
    const { queryable, calls } = scriptedQueryable([
      postedContext,
      { match: /select 1 from invoice_line_items/i, rowCount: 0 }
    ]);

    await reflectRegisterEntryUpdate(
      billableEntry({ jobId: 'job-1', description: 'Edited', totalAmount: 95 }),
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_UPDATE)).toBeUndefined();
    expect(findCall(calls, NOTE)).toBeUndefined();
  });

  it('drops a posted-invoice register void but notes it when a linked line existed', async () => {
    const { queryable, calls } = scriptedQueryable([
      postedContext,
      { match: /select 1 from invoice_line_items/i, rowCount: 1, rows: [{ exists: 1 }] }
    ]);

    await reflectRegisterEntryVoid(
      're-1',
      'job-1',
      'Late part',
      'Tech Tina',
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    expect(findCall(calls, LINE_VOID)).toBeUndefined();
    const note = findCall(calls, NOTE);
    expect(note?.params).toContain('registerEntryNotReflected');
  });
});
