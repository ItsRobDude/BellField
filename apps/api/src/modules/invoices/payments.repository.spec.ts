import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import type { QueryExecutor } from '../../database/database.service';

// Scripted queryable: match each query by an SQL fragment, return a canned result,
// record every call. Mirrors invoices.repository.spec.ts.
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

function repositoryWith(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const { queryable, calls } = scriptedQueryable(handlers);
  const databaseService = {
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never
  };
  return { repository: new PaymentsRepository(databaseService as never), calls };
}

const PAYMENT_ROW = {
  id: 'pay-1',
  jobId: 'job-1',
  invoiceId: 'inv-main',
  amount: '200.00',
  method: 'card',
  source: 'manual',
  purpose: 'payment',
  provider: null,
  currency: 'USD',
  receivedAt: '2026-06-02T00:00:00.000Z',
  reference: null,
  memo: null,
  recordedByEmployeeId: 'emp-1',
  recordedByName: 'Bea Bookkeeper',
  processorFee: null,
  applicationFee: null,
  providerPaymentId: null,
  providerSessionId: null,
  isVoid: false,
  voidReason: null,
  voidedByName: null,
  voidedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z'
};

const actor = { id: 'emp-1', displayName: 'Bea Bookkeeper' };

// The target invoice is READ (not locked) first; locks are then taken in a
// consistent order (job row, then posted invoices) to avoid a deadlock.
const INVOICE_READ = /from invoices where id = \$1 limit 1(?! for update)/i;
const JOB_LOCK = /select id from jobs where id = \$1 for update/i;
const POSTED_SET_LOCK = /select id from invoices\s+where job_id = \$1 and status = 'posted'/i;
const TIMELINE_INSERT = /insert into job_timeline_entries/i;
const ALLOCATION_SELECT = /from payment_allocations pa\s+join invoices i/i;

describe('PaymentsRepository.recordDeposit', () => {
  const depositInput = {
    amount: 500,
    method: 'check' as const,
    receivedAt: '2026-06-16T00:00:00.000Z',
    actor
  };

  it('records a job-level deposit as unallocated credit before any posting', async () => {
    const { repository, calls } = repositoryWith([
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: POSTED_SET_LOCK, rows: [] },
      { match: /insert into payments/i, rowCount: 1 },
      // No posted charges → nothing to allocate; the money is held as job credit.
      { match: /from invoices i\s+left join active_allocations/i, rows: [] },
      { match: /and invoice_kind = 'credit'/i, rows: [{ cents: 0 }] },
      { match: /and id <> \$2/i, rows: [{ cents: 0 }] },
      { match: TIMELINE_INSERT, rowCount: 1 },
      {
        match: /from payments where id = \$1/i,
        rows: [
          { ...PAYMENT_ROW, id: 'dep-1', invoiceId: null, amount: '500.00', purpose: 'deposit' }
        ]
      },
      { match: ALLOCATION_SELECT, rows: [] }
    ]);

    const result = await repository.recordDeposit('job-1', depositInput);

    expect(result.purpose).toBe('deposit');
    expect(result.invoiceId).toBeUndefined();
    const insert = findCall(calls, /insert into payments/i);
    expect(insert?.params).toContain('deposit'); // purpose
    expect(insert?.params).toContain('manual'); // source
    expect(insert?.params).toContain(null); // invoice_id
    expect(findCall(calls, /insert into payment_allocations/i)).toBeUndefined();
    const timeline = findCall(calls, TIMELINE_INSERT);
    expect(timeline?.params[4]).toBe('paymentRecorded');
    expect(String(timeline?.params[5])).toMatch(/Deposit of \$500\.00 recorded \(check\)/);
  });

  it('allocates a deposit to posted charges when they exist', async () => {
    const { repository, calls } = repositoryWith([
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: POSTED_SET_LOCK, rows: [] },
      { match: /insert into payments/i, rowCount: 1 },
      {
        match: /from invoices i\s+left join active_allocations/i,
        rows: [{ invoiceId: 'inv-main', invoiceKind: 'main', total: '300.00', allocated: '0.00' }]
      },
      { match: /and invoice_kind = 'credit'/i, rows: [{ cents: 0 }] },
      { match: /and id <> \$2/i, rows: [{ cents: 0 }] },
      { match: /insert into payment_allocations/i, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 },
      {
        match: /from payments where id = \$1/i,
        rows: [
          { ...PAYMENT_ROW, id: 'dep-1', invoiceId: null, amount: '200.00', purpose: 'deposit' }
        ]
      },
      { match: ALLOCATION_SELECT, rows: [] }
    ]);

    await repository.recordDeposit('job-1', { ...depositInput, amount: 200 });

    const allocation = findCall(calls, /insert into payment_allocations/i);
    expect(allocation?.params).toContain('inv-main');
    expect(allocation?.params).toContain(200);
  });

  it('throws NotFound for an unknown job before writing', async () => {
    const { repository, calls } = repositoryWith([{ match: JOB_LOCK, rows: [] }]);

    await expect(repository.recordDeposit('missing', depositInput)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(findCall(calls, /insert into payments/i)).toBeUndefined();
  });
});

describe('PaymentsRepository.recordPayment', () => {
  it('records against a posted invoice and writes a paymentRecorded timeline entry', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_READ, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'main' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: POSTED_SET_LOCK, rows: [] },
      { match: /insert into payments/i, rowCount: 1 },
      { match: /from invoices i\s+left join active_allocations/i, rows: [] },
      {
        match:
          /from invoices\s+where job_id = \$1\s+and status = 'posted'\s+and invoice_kind = 'credit'/i,
        rows: [{ cents: 0 }]
      },
      {
        match: /from payments\s+where is_void = false\s+and job_id = \$1\s+and id <> \$2/i,
        rows: [{ cents: 0 }]
      },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [PAYMENT_ROW] },
      {
        match: ALLOCATION_SELECT,
        rows: [{ paymentId: 'pay-1', invoiceId: 'inv-main', invoiceKind: 'main', amount: '200.00' }]
      }
    ]);

    const result = await repository.recordPayment('inv-main', {
      amount: 200,
      method: 'card',
      receivedAt: '2026-06-02T00:00:00.000Z',
      actor
    });

    expect(result.amount).toBe(200);
    const insert = findCall(calls, /insert into payments/i);
    expect(insert?.params).toContain(200);
    expect(insert?.params).toContain('card');
    const timeline = findCall(calls, TIMELINE_INSERT);
    // insertJobTimelineEntry values: [id, jobId, occurredAt, actorName, kind, message]
    expect(timeline?.params[3]).toBe('Bea Bookkeeper');
    expect(timeline?.params[4]).toBe('paymentRecorded');
  });

  it('locks the job row and posted set, never the single target invoice (deadlock-safe order)', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_READ, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'main' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: POSTED_SET_LOCK, rows: [] },
      { match: /insert into payments/i, rowCount: 1 },
      { match: /from invoices i\s+left join active_allocations/i, rows: [] },
      { match: /and invoice_kind = 'credit'/i, rows: [{ cents: 0 }] },
      { match: /and id <> \$2/i, rows: [{ cents: 0 }] },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [PAYMENT_ROW] },
      { match: ALLOCATION_SELECT, rows: [] }
    ]);

    await repository.recordPayment('inv-main', {
      amount: 200,
      method: 'card',
      receivedAt: '2026-06-02T00:00:00.000Z',
      actor
    });

    // The single target invoice is never locked on its own (that out-of-order
    // row lock is what deadlocked); the job row is locked before the posted set.
    expect(findCall(calls, /from invoices where id = \$1 limit 1 for update/i)).toBeUndefined();
    const jobLockIdx = calls.findIndex((c) => JOB_LOCK.test(c.sql));
    const setLockIdx = calls.findIndex((c) => POSTED_SET_LOCK.test(c.sql));
    const insertIdx = calls.findIndex((c) => /insert into payments/i.test(c.sql));
    expect(jobLockIdx).toBeGreaterThanOrEqual(0);
    expect(jobLockIdx).toBeLessThan(setLockIdx);
    expect(setLockIdx).toBeLessThan(insertIdx);
  });

  it('rejects a payment against a draft invoice and writes nothing', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_READ, rows: [{ jobId: 'job-1', status: 'draft', invoiceKind: 'main' }] }
    ]);

    await expect(
      repository.recordPayment('inv-main', { amount: 50, method: 'cash', receivedAt: 'x', actor })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findCall(calls, /insert into payments/i)).toBeUndefined();
    // Validation rejects before any lock is taken.
    expect(findCall(calls, JOB_LOCK)).toBeUndefined();
  });

  it('rejects a payment against a credit', async () => {
    const { repository } = repositoryWith([
      { match: INVOICE_READ, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'credit' }] }
    ]);

    await expect(
      repository.recordPayment('inv-cred', { amount: 50, method: 'cash', receivedAt: 'x', actor })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allocates a re-payment after a full refund (refund-aware net-due cap)', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_READ, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'main' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: POSTED_SET_LOCK, rows: [] },
      { match: /insert into payments/i, rowCount: 1 },
      // $100 invoice whose prior payment was fully refunded → net allocated 0, $100 remaining.
      {
        match: /from invoices i\s+left join active_allocations/i,
        rows: [{ invoiceId: 'inv-main', invoiceKind: 'main', total: '100.00', allocated: '0.00' }]
      },
      { match: /and invoice_kind = 'credit'/i, rows: [{ cents: 0 }] },
      // Gross paid by the prior non-void payment is $100...
      {
        match: /from payments\s+where is_void = false\s+and job_id = \$1\s+and id <> \$2/i,
        rows: [{ cents: 10000 }]
      },
      // ...but $100 was refunded, so effective paid is $0 and the new payment allocates.
      { match: /from payment_refunds\s+where job_id = \$1/i, rows: [{ cents: 10000 }] },
      { match: /insert into payment_allocations/i, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [PAYMENT_ROW] },
      { match: ALLOCATION_SELECT, rows: [] }
    ]);

    await repository.recordPayment('inv-main', {
      amount: 100,
      method: 'card',
      receivedAt: '2026-06-03T00:00:00.000Z',
      actor
    });

    // Without subtracting refunds from the net-due cap this would allocate $0.
    const allocInsert = findCall(calls, /insert into payment_allocations/i);
    expect(allocInsert).toBeDefined();
    expect(allocInsert?.params).toEqual(expect.arrayContaining(['inv-main', 100]));
  });
});

describe('PaymentsRepository.voidPayment', () => {
  it('writes the void audit (actor) to the row and the timeline', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /from payments\s+where id = \$1\s+for update/i,
        rows: [{ jobId: 'job-1', isVoid: false, amount: '200.00', source: 'manual' }]
      },
      { match: /update payments set/i, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [{ ...PAYMENT_ROW, isVoid: true }] },
      {
        match: ALLOCATION_SELECT,
        rows: [{ paymentId: 'pay-1', invoiceId: 'inv-main', invoiceKind: 'main', amount: '200.00' }]
      }
    ]);

    await repository.voidPayment('pay-1', 'entered twice', actor);

    const update = findCall(calls, /update payments set/i);
    // The void writes the real actor, not a system placeholder.
    expect(update?.sql).toMatch(/voided_by_employee_id/);
    expect(update?.params).toContain('emp-1');
    expect(update?.params).toContain('Bea Bookkeeper');
    const timeline = findCall(calls, TIMELINE_INSERT);
    expect(timeline?.params[3]).toBe('Bea Bookkeeper');
    expect(timeline?.params[4]).toBe('paymentVoided');
  });

  it('rejects a double-void and writes no timeline entry', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /from payments\s+where id = \$1\s+for update/i,
        rows: [{ jobId: 'job-1', isVoid: true, amount: '200.00', source: 'manual' }]
      }
    ]);

    await expect(repository.voidPayment('pay-1', undefined, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, TIMELINE_INSERT)).toBeUndefined();
  });

  it('rejects manual voids for provider-confirmed online payments', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /from payments\s+where id = \$1\s+for update/i,
        rows: [{ jobId: 'job-1', isVoid: false, amount: '200.00', source: 'bellfield_payments' }]
      }
    ]);

    await expect(repository.voidPayment('pay-1', undefined, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, /update payments set/i)).toBeUndefined();
    expect(findCall(calls, TIMELINE_INSERT)).toBeUndefined();
  });

  it('rejects voiding a payment that already has refunds recorded', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: /from payments\s+where id = \$1\s+for update/i,
        rows: [{ jobId: 'job-1', isVoid: false, amount: '200.00', source: 'manual' }]
      },
      { match: /from payment_refunds where payment_id = \$1 limit 1/i, rows: [{ exists: 1 }] }
    ]);

    await expect(repository.voidPayment('pay-1', undefined, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
    // Voiding alongside an existing refund would inflate the balance, so it never writes.
    expect(findCall(calls, /update payments set/i)).toBeUndefined();
    expect(findCall(calls, TIMELINE_INSERT)).toBeUndefined();
  });
});

const PAYMENT_HEAD = /from payments where id = \$1 limit 1/i;
const PAYMENT_FOR_UPDATE = /from payments where id = \$1\s+for update/i;
const SUM_REFUND_FOR_PAYMENT = /from payment_refunds\s+where payment_id = \$1/i;
const INSERT_REFUND = /insert into payment_refunds /i;
const REVERSAL_SELECT = /from payment_allocations pa\s+join invoices i/i;
const INSERT_REFUND_ALLOC = /insert into payment_refund_allocations/i;
const FIND_REFUND = /from payment_refunds where id = \$1/i;
const HYDRATE_REFUND_ALLOC = /from payment_refund_allocations ra\s+join invoices i/i;

const REFUND_ROW = {
  id: 'ref-1',
  paymentId: 'pay-1',
  jobId: 'job-1',
  amount: '170.00',
  method: 'card',
  source: 'manual',
  provider: null,
  currency: 'USD',
  refundedAt: '2026-06-03T00:00:00.000Z',
  reason: null,
  recordedByName: 'Bea Bookkeeper',
  applicationFeeRefunded: null,
  providerRefundId: null,
  providerPaymentId: null,
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z'
};

function refundHandlers(
  overrides: {
    forUpdate?: Record<string, unknown>;
    priorRefundCents?: number;
    allocations?: Array<{ invoiceId: string; allocatedCents: string; refundedCents: string }>;
  } = {}
) {
  return [
    { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
    { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
    { match: POSTED_SET_LOCK, rows: [] },
    {
      match: PAYMENT_FOR_UPDATE,
      rows: [
        {
          jobId: 'job-1',
          amount: '200.00',
          method: 'card',
          currency: 'USD',
          source: 'manual',
          isVoid: false,
          ...overrides.forUpdate
        }
      ]
    },
    { match: SUM_REFUND_FOR_PAYMENT, rows: [{ cents: overrides.priorRefundCents ?? 0 }] },
    { match: INSERT_REFUND, rowCount: 1 },
    {
      match: REVERSAL_SELECT,
      rows: overrides.allocations ?? [
        { invoiceId: 'inv-main', allocatedCents: '15000', refundedCents: '0' },
        { invoiceId: 'inv-adj', allocatedCents: '5000', refundedCents: '0' }
      ]
    },
    { match: INSERT_REFUND_ALLOC, rowCount: 1 },
    { match: TIMELINE_INSERT, rowCount: 1 },
    { match: FIND_REFUND, rows: [REFUND_ROW] },
    { match: HYDRATE_REFUND_ALLOC, rows: [] }
  ];
}

describe('PaymentsRepository.refundPayment', () => {
  it('records a manual refund and reverses the payment allocations main-first', async () => {
    const { repository, calls } = repositoryWith(refundHandlers());

    const result = await repository.refundPayment('pay-1', {
      amount: 170,
      reason: 'returned',
      actor
    });

    expect(result.amount).toBe(170);
    const refundInsert = findCall(calls, INSERT_REFUND);
    expect(refundInsert?.params).toContain(170);
    expect(refundInsert?.sql).toMatch(/'manual'/);
    // $170 reverses the full $150 main allocation, then $20 of the adjustment.
    const allocInserts = calls.filter((c) => INSERT_REFUND_ALLOC.test(c.sql));
    expect(allocInserts).toHaveLength(2);
    expect(allocInserts[0].params).toEqual(expect.arrayContaining(['inv-main', 150]));
    expect(allocInserts[1].params).toEqual(expect.arrayContaining(['inv-adj', 20]));
    const timeline = findCall(calls, TIMELINE_INSERT);
    expect(timeline?.params[4]).toBe('paymentRefunded');
  });

  it('refunds a manual deposit (no allocations) — records the refund, reverses nothing', async () => {
    // A deposit held as job credit has no allocations to reverse; the refund still
    // records and lowers net paid. (Deposits are source=manual, so they refund here.)
    const { repository, calls } = repositoryWith(refundHandlers({ allocations: [] }));

    await repository.refundPayment('pay-1', { amount: 200, actor });

    const refundInsert = findCall(calls, INSERT_REFUND);
    expect(refundInsert?.params).toContain(200);
    expect(calls.filter((c) => INSERT_REFUND_ALLOC.test(c.sql))).toHaveLength(0);
  });

  it('rejects a refund larger than the payment', async () => {
    const { repository, calls } = repositoryWith(refundHandlers());

    await expect(repository.refundPayment('pay-1', { amount: 250, actor })).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, INSERT_REFUND)).toBeUndefined();
  });

  it('rejects a refund beyond the amount still refundable after prior refunds', async () => {
    // $200 payment, $150 already refunded → only $50 remains; $60 must be rejected.
    const { repository, calls } = repositoryWith(refundHandlers({ priorRefundCents: 15000 }));

    await expect(repository.refundPayment('pay-1', { amount: 60, actor })).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, INSERT_REFUND)).toBeUndefined();
  });

  it('rejects refunding a voided payment', async () => {
    const { repository, calls } = repositoryWith(refundHandlers({ forUpdate: { isVoid: true } }));

    await expect(repository.refundPayment('pay-1', { amount: 10, actor })).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, INSERT_REFUND)).toBeUndefined();
  });

  it('rejects manually refunding an online card payment', async () => {
    const { repository, calls } = repositoryWith(
      refundHandlers({ forUpdate: { source: 'bellfield_payments' } })
    );

    await expect(repository.refundPayment('pay-1', { amount: 10, actor })).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, INSERT_REFUND)).toBeUndefined();
  });
});
