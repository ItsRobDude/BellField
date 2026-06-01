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

describe('invoice reflection utils', () => {
  it('reflects a register create as a quantity-1 linked line at the register total, then recomputes', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: /select id from invoices/i, rows: [{ id: 'inv-1' }] },
      { match: /coalesce\(max\(line_position\)/i, rows: [{ nextPosition: 2 }] },
      {
        match: /from invoices where id =/i,
        rows: [
          {
            taxRateBasisPoints: 0,
            discountKind: null,
            discountBasisPoints: null,
            discountAmount: null
          }
        ]
      },
      {
        match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
        rows: []
      }
    ]);

    await reflectRegisterEntryCreate(
      'job-1',
      { id: 're-1', kind: 'part', description: 'Contactor', totalAmount: 125 },
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const insert = findCall(calls, /insert into invoice_line_items/i);
    expect(insert).toBeDefined();
    // quantity is the literal 1; unit_price and line_subtotal are the register total.
    expect(insert?.params).toContain(125);
    expect(insert?.params).toContain('re-1');
    // source_kind 'register' and quantity 1 are SQL literals in the insert.
    expect(insert?.sql).toMatch(/'register'/);
    expect(insert?.sql).toMatch(/values \(\$1, \$2, \$3, \$4, \$5, 1,/);
    // A recompute (update invoices) follows.
    expect(findCall(calls, /update invoices set/i)).toBeDefined();
  });

  it('updates only a linked invoice line and recomputes when a row changed', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: /update invoice_line_items set/i, rowCount: 1 },
      { match: /select id from invoices/i, rows: [{ id: 'inv-1' }] },
      {
        match: /from invoices where id =/i,
        rows: [
          {
            taxRateBasisPoints: 0,
            discountKind: null,
            discountBasisPoints: null,
            discountAmount: null
          }
        ]
      },
      {
        match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
        rows: []
      }
    ]);

    await reflectRegisterEntryUpdate(
      { id: 're-1', jobId: 'job-1', kind: 'part', description: 'New', totalAmount: 95 },
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    const update = findCall(calls, /update invoice_line_items set/i);
    // The WHERE clause restricts to linked, non-void lines for this register entry.
    expect(update?.sql).toMatch(/source_sync_state = 'linked'/);
    expect(update?.sql).toMatch(/is_void = false/);
    expect(findCall(calls, /update invoices set/i)).toBeDefined();
  });

  it('does not recompute when the register edit matched no linked line (detached/none)', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: /update invoice_line_items set/i, rowCount: 0 }
    ]);

    await reflectRegisterEntryUpdate(
      { id: 're-1', jobId: 'job-1', kind: 'part', description: 'New', totalAmount: 95 },
      '2026-06-01T00:00:00.000Z',
      queryable
    );

    // No invoice lookup or totals recompute when nothing was reflected.
    expect(findCall(calls, /select id from invoices/i)).toBeUndefined();
    expect(findCall(calls, /update invoices set/i)).toBeUndefined();
  });

  it('voids the linked invoice line and recomputes', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: /update invoice_line_items set\s+is_void = true/i, rowCount: 1 },
      { match: /select id from invoices/i, rows: [{ id: 'inv-1' }] },
      {
        match: /from invoices where id =/i,
        rows: [
          {
            taxRateBasisPoints: 0,
            discountKind: null,
            discountBasisPoints: null,
            discountAmount: null
          }
        ]
      },
      {
        match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
        rows: []
      }
    ]);

    await reflectRegisterEntryVoid('re-1', 'job-1', '2026-06-01T00:00:00.000Z', queryable);

    const voidCall = findCall(calls, /update invoice_line_items set\s+is_void = true/i);
    expect(voidCall?.sql).toMatch(/source_sync_state = 'linked'/);
    expect(findCall(calls, /update invoices set/i)).toBeDefined();
  });
});
