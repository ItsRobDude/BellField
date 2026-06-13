import { ConflictException } from '@nestjs/common';
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
});
