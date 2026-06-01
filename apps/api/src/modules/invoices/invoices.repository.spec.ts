import { ConflictException } from '@nestjs/common';
import { InvoicesRepository, type EstimateConversionInput } from './invoices.repository';
import type { QueryExecutor } from '../../database/database.service';

// A tiny scripted queryable: each query is matched by a fragment of its SQL and
// returns a canned result, while every call is recorded for assertions. Mirrors
// the helper used in invoice-reflection-utils.spec.ts.
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

function countCalls(calls: Array<{ sql: string; params: unknown[] }>, fragment: RegExp) {
  return calls.filter((c) => fragment.test(c.sql)).length;
}

// Build a repository whose transaction runs the callback against a scripted
// queryable, so we can assert exactly which writes the conversion emits.
function repositoryWith(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const { queryable, calls } = scriptedQueryable(handlers);
  const databaseService = {
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never
  };
  const repository = new InvoicesRepository(databaseService as never);
  return { repository, calls };
}

const HANDLERS_FOUND_DRAFT = {
  match: /select id from invoices where job_id/i,
  rows: [{ id: 'inv-1' }]
};
const HANDLERS_CLAIM_OK = { match: /update estimates set/i, rowCount: 1 };
const HANDLERS_NEXT_POSITION = {
  match: /coalesce\(max\(line_position\)/i,
  rows: [{ nextPosition: 1 }]
};
const HANDLERS_INSERT_LINE = { match: /insert into invoice_line_items/i, rowCount: 1 };
const HANDLERS_TOUCH_JOB = { match: /update jobs set updated_at/i, rowCount: 1 };
const HANDLERS_TIMELINE = { match: /insert into job_timeline_entries/i, rowCount: 1 };
// recalculateInvoiceTotals' header read + line read + totals write.
const HANDLERS_RECALC_HEADER = {
  match: /from invoices where id = \$1/i,
  rows: [
    { taxRateBasisPoints: 0, discountKind: null, discountBasisPoints: null, discountAmount: null }
  ]
};
const HANDLERS_RECALC_LINES = {
  match: /from invoice_line_items\s+where invoice_id = \$1 and is_void = false\s+order by/i,
  rows: []
};
const HANDLERS_RECALC_WRITE = { match: /update invoices set\s+subtotal_amount/i, rowCount: 1 };

// The two writes whose presence distinguishes the conversion modes.
const HEADER_ADOPT = /update invoices set\s+tax_rate_basis_points/i;
const REPLACE_VOID = /update invoice_line_items\s+set is_void = true, void_reason = 'Replaced/i;

function conversionInput(): EstimateConversionInput {
  return {
    estimateId: 'estimate-1',
    estimateTitle: 'Add-on work',
    taxRateBasisPoints: 825,
    discount: { kind: 'percent', basisPoints: 1000 },
    lines: [
      {
        estimateLineItemId: 'eli-1',
        kind: 'part',
        description: 'Estimate part',
        quantity: 1,
        unitPrice: 200,
        taxable: true
      }
    ],
    actor: { id: 'emp-1', displayName: 'Olivia Owner' }
  };
}

describe('InvoicesRepository.convertEstimateIntoDraft', () => {
  it('appending onto a draft that already has lines leaves the invoice header terms untouched', async () => {
    // hadLines = true: the estimate is being added on top of captured work.
    const { repository, calls } = repositoryWith([
      HANDLERS_FOUND_DRAFT,
      HANDLERS_CLAIM_OK,
      { match: /select count\(\*\) as count from invoice_line_items/i, rows: [{ count: 2 }] },
      HANDLERS_NEXT_POSITION,
      HANDLERS_INSERT_LINE,
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE,
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    const result = await repository.convertEstimateIntoDraft('job-1', conversionInput(), 'append');

    expect(result).toEqual({ invoiceId: 'inv-1' });
    // The estimate's tax/discount must NOT overwrite the draft's existing terms.
    expect(findCall(calls, HEADER_ADOPT)).toBeUndefined();
    // Append never voids existing lines.
    expect(findCall(calls, REPLACE_VOID)).toBeUndefined();
    // The estimate line is still inserted and totals recomputed from the header.
    expect(countCalls(calls, /insert into invoice_line_items/i)).toBe(1);
    expect(findCall(calls, HANDLERS_RECALC_WRITE.match)).toBeDefined();
  });

  it('appending onto an empty draft adopts the estimate tax/discount (it becomes the whole bill)', async () => {
    // hadLines = false: nothing captured yet, so the estimate defines the terms.
    const { repository, calls } = repositoryWith([
      HANDLERS_FOUND_DRAFT,
      HANDLERS_CLAIM_OK,
      { match: /select count\(\*\) as count from invoice_line_items/i, rows: [{ count: 0 }] },
      { match: HEADER_ADOPT, rowCount: 1 },
      HANDLERS_NEXT_POSITION,
      HANDLERS_INSERT_LINE,
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE,
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.convertEstimateIntoDraft('job-1', conversionInput(), 'append');

    const adopt = findCall(calls, HEADER_ADOPT);
    expect(adopt).toBeDefined();
    // It carries the estimate's tax rate and percent discount basis points.
    expect(adopt?.params).toContain(825);
    expect(adopt?.params).toContain(1000);
    // No existing lines to void.
    expect(findCall(calls, REPLACE_VOID)).toBeUndefined();
  });

  it('replace mode voids existing lines and adopts the estimate tax/discount', async () => {
    const { repository, calls } = repositoryWith([
      HANDLERS_FOUND_DRAFT,
      HANDLERS_CLAIM_OK,
      { match: /select count\(\*\) as count from invoice_line_items/i, rows: [{ count: 2 }] },
      { match: REPLACE_VOID, rowCount: 2 },
      { match: HEADER_ADOPT, rowCount: 1 },
      HANDLERS_NEXT_POSITION,
      HANDLERS_INSERT_LINE,
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE,
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.convertEstimateIntoDraft('job-1', conversionInput(), 'replace');

    expect(findCall(calls, REPLACE_VOID)).toBeDefined();
    expect(findCall(calls, HEADER_ADOPT)).toBeDefined();
  });

  it('rejects with a conflict and writes no lines when the estimate claim changes no rows', async () => {
    // claim rowCount = 0: estimate is not approved or was already converted (race).
    const { repository, calls } = repositoryWith([
      HANDLERS_FOUND_DRAFT,
      { match: /update estimates set/i, rowCount: 0 }
    ]);

    await expect(
      repository.convertEstimateIntoDraft('job-1', conversionInput(), 'append')
    ).rejects.toBeInstanceOf(ConflictException);

    // The guarded claim short-circuits before any line writes.
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeUndefined();
    expect(findCall(calls, HEADER_ADOPT)).toBeUndefined();
    expect(findCall(calls, REPLACE_VOID)).toBeUndefined();
  });
});
