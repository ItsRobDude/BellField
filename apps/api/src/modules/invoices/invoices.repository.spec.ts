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
    // Non-transactional reads (e.g. getInvoiceById) run against the same scripted
    // queryable so reload-after-write paths are exercised too.
    query: queryable.query,
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never
  };
  const repository = new InvoicesRepository(databaseService as never);
  return { repository, calls };
}

const HANDLERS_FOUND_DRAFT = {
  match: /select id, status from invoices\s+where job_id/i,
  rows: [{ id: 'inv-1', status: 'draft' }]
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
        taxable: true,
        // Deliberately NOT equal to quantity * unitPrice (200), so a test can
        // prove the converted line copies the frozen snapshot rather than
        // re-deriving the subtotal.
        lineSubtotal: 199.99
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
    // The invoice row is locked FOR UPDATE before any write (posted-lock race guard).
    expect(findCall(calls, /select id, status from invoices\s+where job_id/i)?.sql).toMatch(
      /for update/i
    );
    // The estimate's tax/discount must NOT overwrite the draft's existing terms.
    expect(findCall(calls, HEADER_ADOPT)).toBeUndefined();
    // Append never voids existing lines.
    expect(findCall(calls, REPLACE_VOID)).toBeUndefined();
    // The estimate line is still inserted and totals recomputed from the header.
    expect(countCalls(calls, /insert into invoice_line_items/i)).toBe(1);
    expect(findCall(calls, HANDLERS_RECALC_WRITE.match)).toBeDefined();
    // The inserted line copies the estimate's frozen subtotal (199.99), not the
    // re-derived quantity * unitPrice (200). line_subtotal_amount is the 13th value.
    const insert = findCall(calls, /insert into invoice_line_items/i);
    expect(insert?.params[12]).toBe(199.99);
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

  it('rejects in-transaction when the draft has lines but no mode was given (block-with-choice TOCTOU)', async () => {
    // The service may pass mode=undefined after a clean pre-check, but a line can
    // be added before this transaction runs. hadLines=true here proves the gate is
    // enforced atomically, not just by the earlier read.
    const { repository, calls } = repositoryWith([
      HANDLERS_FOUND_DRAFT,
      HANDLERS_CLAIM_OK,
      { match: /select count\(\*\) as count from invoice_line_items/i, rows: [{ count: 1 }] }
    ]);

    await expect(
      repository.convertEstimateIntoDraft('job-1', conversionInput(), undefined)
    ).rejects.toBeInstanceOf(ConflictException);

    // No line writes and no header change: the gate fires before those steps.
    // (The estimate claim update does run first, but it rolls back with the
    // aborted transaction, so nothing is persisted.)
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeUndefined();
    expect(findCall(calls, HEADER_ADOPT)).toBeUndefined();
    expect(findCall(calls, REPLACE_VOID)).toBeUndefined();
  });

  it('appending onto an empty draft with no mode adopts the estimate terms (no block)', async () => {
    // hadLines=false + mode undefined: nothing to disambiguate, so it proceeds and
    // the estimate becomes the whole bill.
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

    const result = await repository.convertEstimateIntoDraft('job-1', conversionInput(), undefined);

    expect(result).toEqual({ invoiceId: 'inv-1' });
    expect(findCall(calls, HEADER_ADOPT)).toBeDefined();
    expect(countCalls(calls, /insert into invoice_line_items/i)).toBe(1);
  });

  it('refuses to convert into a posted (locked) invoice and claims no estimate', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /select id, status from invoices\s+where job_id/i,
        rows: [{ id: 'inv-1', status: 'posted' }]
      }
    ]);

    await expect(
      repository.convertEstimateIntoDraft('job-1', conversionInput(), 'append')
    ).rejects.toBeInstanceOf(ConflictException);

    // The posted guard fires before the estimate claim or any line write.
    expect(findCall(calls, /update estimates set/i)).toBeUndefined();
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeUndefined();
  });
});

describe('InvoicesRepository.postInvoice', () => {
  const snapshot = {
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme Co',
    billToAccountType: 'company',
    billToAddressLine1: '1 Main St',
    billToCity: 'Springfield',
    billToState: 'IL',
    billToPostalCode: '62704',
    serviceLocationId: 'location-1',
    serviceLocationName: 'Acme HQ',
    serviceLocationAddressLine1: '2 Plant Rd',
    serviceLocationCity: 'Springfield',
    serviceLocationState: 'IL',
    serviceLocationPostalCode: '62704',
    jobNumber: '1001',
    workOrderNumber: 'WO-9'
  };
  const actor = { id: 'owner-1', displayName: 'Olivia Owner' };
  const POST_UPDATE = /update invoices set\s+status = 'posted'/i;
  const SERIES_INCREMENT = /update invoice_number_series\s+set next_value = next_value \+ 1/i;
  const NUMBER_UPDATE = /update invoices\s+set invoice_sequence/i;

  it('locks the draft by id, freezes the snapshot, bumps version, and logs the post', async () => {
    const { repository, calls } = repositoryWith([
      // The guarded update returns the job id (and kind) for the timeline.
      { match: POST_UPDATE, rowCount: 1, rows: [{ jobId: 'job-1', invoiceKind: 'main' }] },
      { match: SERIES_INCREMENT, rowCount: 1, rows: [{ assigned: '1042' }] },
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE
    ]);

    await repository.postInvoice('inv-1', snapshot, actor);

    const post = findCall(calls, POST_UPDATE);
    expect(post).toBeDefined();
    // Guarded transition by id (works for the main or an adjustment), atomic against a
    // concurrent post; returns job_id so no second read is needed.
    expect(post?.sql).toMatch(/where id = \$1 and status = 'draft'/i);
    expect(post?.sql).toMatch(/returning job_id/i);
    expect(post?.sql).toMatch(/version = version \+ 1/i);
    expect(post?.params).toContain('Acme Co');
    expect(post?.params).toContain('1001');
    // Posting must NOT change job status — only touch updated_at, keyed on the job id
    // returned by the update.
    const jobTouch = findCall(calls, /update jobs set/i);
    expect(jobTouch?.sql).toMatch(/update jobs set updated_at = \$2 where id = \$1/i);
    expect(jobTouch?.sql).not.toMatch(/status/i);
    expect(jobTouch?.params).toContain('job-1');
    // It records an invoicePosted timeline event and does NOT recompute money.
    const timeline = findCall(calls, /insert into job_timeline_entries/i);
    expect(timeline?.params).toContain('invoicePosted');
    expect(findCall(calls, /update invoices set\s+subtotal_amount/i)).toBeUndefined();
    // It reserves the next shared number (single-statement increment, gapless on
    // rollback) and stamps the formatted number on the invoice (main => INV-).
    const reserve = findCall(calls, SERIES_INCREMENT);
    expect(reserve?.sql).toMatch(/returning \(next_value - 1\)::bigint as "assigned"/i);
    const numberUpdate = findCall(calls, NUMBER_UPDATE);
    expect(numberUpdate?.params).toEqual(['inv-1', '1042', 'INV-1042']);
  });

  it('formats the number by kind: a posted credit gets the CR- prefix on the shared counter', async () => {
    const { repository, calls } = repositoryWith([
      { match: POST_UPDATE, rowCount: 1, rows: [{ jobId: 'job-1', invoiceKind: 'credit' }] },
      { match: SERIES_INCREMENT, rowCount: 1, rows: [{ assigned: '1043' }] },
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE
    ]);

    await repository.postInvoice('inv-credit', snapshot, actor);

    const numberUpdate = findCall(calls, NUMBER_UPDATE);
    expect(numberUpdate?.params).toEqual(['inv-credit', '1043', 'CR-1043']);
  });

  it('formats the number by kind: a posted adjustment gets the ADJ- prefix on the shared counter', async () => {
    const { repository, calls } = repositoryWith([
      { match: POST_UPDATE, rowCount: 1, rows: [{ jobId: 'job-1', invoiceKind: 'adjustment' }] },
      { match: SERIES_INCREMENT, rowCount: 1, rows: [{ assigned: '1044' }] },
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE
    ]);

    await repository.postInvoice('inv-adjustment', snapshot, actor);

    const numberUpdate = findCall(calls, NUMBER_UPDATE);
    expect(numberUpdate?.params).toEqual(['inv-adjustment', '1044', 'ADJ-1044']);
  });

  it('fails the post if the number series row is missing (data-integrity fault, not silent)', async () => {
    const { repository } = repositoryWith([
      { match: POST_UPDATE, rowCount: 1, rows: [{ jobId: 'job-1', invoiceKind: 'main' }] },
      { match: SERIES_INCREMENT, rowCount: 0, rows: [] }
    ]);

    await expect(repository.postInvoice('inv-1', snapshot, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects with a conflict and writes no timeline when the invoice is no longer a draft', async () => {
    const { repository, calls } = repositoryWith([{ match: POST_UPDATE, rowCount: 0 }]);

    await expect(repository.postInvoice('inv-1', snapshot, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /insert into job_timeline_entries/i)).toBeUndefined();
    expect(findCall(calls, /update jobs set/i)).toBeUndefined();
  });
});

describe('InvoicesRepository.createAdjustment', () => {
  const actor = { id: 'owner-1', displayName: 'Olivia Owner' };
  // A complete invoice row for the getInvoiceById reload after creation.
  const adjustmentRow = {
    id: 'adj-1',
    jobId: 'job-1',
    invoiceKind: 'credit',
    status: 'draft',
    taxRateBasisPoints: 0,
    discountKind: null,
    discountBasisPoints: null,
    discountAmount: null,
    subtotalAmount: 0,
    discountAmountApplied: 0,
    taxableBaseAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
    totalCostAmount: 0,
    profitAmount: 0,
    marginBasisPoints: null,
    costComplete: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    postedAt: null,
    postedByName: null,
    billToCustomerId: null,
    billToCustomerName: null,
    billToAccountType: null,
    billToAddressLine1: null,
    billToCity: null,
    billToState: null,
    billToPostalCode: null,
    serviceLocationId: null,
    serviceLocationName: null,
    serviceLocationAddressLine1: null,
    serviceLocationCity: null,
    serviceLocationState: null,
    serviceLocationPostalCode: null,
    jobNumber: null,
    workOrderNumber: null,
    adjustsInvoiceId: 'inv-main'
  };

  it('inserts a draft of the given kind linked to the main, logs it, and returns it', async () => {
    const { repository, calls } = repositoryWith([
      { match: /insert into invoices/i, rowCount: 1 },
      HANDLERS_TOUCH_JOB,
      HANDLERS_TIMELINE,
      { match: /from invoices where id = \$1 limit 1/i, rows: [adjustmentRow] },
      { match: /from invoice_line_items[\s\S]*order by line_position/i, rows: [] }
    ]);

    const result = await repository.createAdjustment('job-1', 'credit', 'inv-main', actor);

    const insert = findCall(calls, /insert into invoices/i);
    expect(insert?.params).toContain('credit');
    expect(insert?.params).toContain('inv-main');
    const timeline = findCall(calls, /insert into job_timeline_entries/i);
    expect(timeline?.params).toContain('invoiceAdjustmentCreated');
    expect(result.invoiceKind).toBe('credit');
    expect(result.adjustsInvoiceId).toBe('inv-main');
  });
});

describe('InvoicesRepository line mutators lock the invoice (posted-lock race guard)', () => {
  const LOCK_BY_JOB =
    /select id, status from invoices\s+where job_id = \$1 and invoice_kind = 'main'/i;
  const LOCK_BY_ID = /select status from invoices where id = \$1/i;
  const validLine = {
    kind: 'other' as const,
    description: 'Trip fee',
    quantity: 1,
    unitPrice: 40,
    taxable: true
  };

  it('addManualLine locks the invoice FOR UPDATE and inserts on a draft', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_JOB, rows: [{ id: 'inv-1', status: 'draft' }] },
      HANDLERS_NEXT_POSITION,
      HANDLERS_INSERT_LINE,
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.addManualLine('job-1', validLine);

    expect(findCall(calls, LOCK_BY_JOB)?.sql).toMatch(/for update/i);
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeDefined();
  });

  it('addManualLine refuses a posted invoice and writes nothing', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_JOB, rows: [{ id: 'inv-1', status: 'posted' }] }
    ]);

    await expect(repository.addManualLine('job-1', validLine)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeUndefined();
  });

  it('addLineToInvoice locks the invoice by id FOR UPDATE and inserts on a draft', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'draft' }] },
      HANDLERS_NEXT_POSITION,
      HANDLERS_INSERT_LINE,
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.addLineToInvoice('adj-1', validLine);

    expect(findCall(calls, LOCK_BY_ID)?.sql).toMatch(/for update/i);
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeDefined();
  });

  it('addLineToInvoice refuses a posted invoice and writes nothing', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'posted' }] }
    ]);

    await expect(repository.addLineToInvoice('adj-1', validLine)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /insert into invoice_line_items/i)).toBeUndefined();
  });

  it('editLine locks the owning invoice by id FOR UPDATE and updates on a draft', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'draft' }] },
      { match: /update invoice_line_items set/i, rowCount: 1 },
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.editLine('line-1', 'inv-1', validLine);

    expect(findCall(calls, LOCK_BY_ID)?.sql).toMatch(/for update/i);
    expect(findCall(calls, /update invoice_line_items set/i)).toBeDefined();
  });

  it('editLine refuses a posted invoice and updates no line', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'posted' }] }
    ]);

    await expect(repository.editLine('line-1', 'inv-1', validLine)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /update invoice_line_items set/i)).toBeUndefined();
  });

  it('voidLine locks the owning invoice by id FOR UPDATE and voids on a draft', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'draft' }] },
      { match: /update invoice_line_items set is_void = true/i, rowCount: 1 },
      HANDLERS_RECALC_HEADER,
      HANDLERS_RECALC_LINES,
      HANDLERS_RECALC_WRITE
    ]);

    await repository.voidLine('line-1', 'inv-1', 'mistake');

    expect(findCall(calls, LOCK_BY_ID)?.sql).toMatch(/for update/i);
    expect(findCall(calls, /update invoice_line_items set is_void = true/i)).toBeDefined();
  });

  it('voidLine refuses a posted invoice and voids no line', async () => {
    const { repository, calls } = repositoryWith([
      { match: LOCK_BY_ID, rows: [{ status: 'posted' }] }
    ]);

    await expect(repository.voidLine('line-1', 'inv-1', 'x')).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /update invoice_line_items set is_void = true/i)).toBeUndefined();
  });
});

describe('InvoicesRepository.listInvoiceTotalsForJob', () => {
  it('reads header totals for all of a job’s invoices without a line query', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /select id, invoice_kind as "invoiceKind", status, total_amount/i,
        rows: [
          { id: 'main-1', invoiceKind: 'main', status: 'posted', total: '100.00' },
          { id: 'adj-1', invoiceKind: 'adjustment', status: 'draft', total: '20.00' }
        ]
      }
    ]);

    const result = await repository.listInvoiceTotalsForJob('job-1');

    expect(findCall(calls, /from invoices where job_id = \$1/i)).toBeDefined();
    // Header-only: no per-invoice line-item query.
    expect(findCall(calls, /from invoice_line_items/i)).toBeUndefined();
    expect(result).toEqual([
      { id: 'main-1', invoiceKind: 'main', status: 'posted', total: 100 },
      { id: 'adj-1', invoiceKind: 'adjustment', status: 'draft', total: 20 }
    ]);
  });
});
