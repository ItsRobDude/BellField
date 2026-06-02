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
  invoiceId: 'inv-main',
  amount: '200.00',
  method: 'card',
  receivedAt: '2026-06-02T00:00:00.000Z',
  reference: null,
  memo: null,
  recordedByEmployeeId: 'emp-1',
  recordedByName: 'Bea Bookkeeper',
  isVoid: false,
  voidReason: null,
  voidedByName: null,
  voidedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z'
};

const actor = { id: 'emp-1', displayName: 'Bea Bookkeeper' };

const INVOICE_LOCK = /from invoices where id = \$1 limit 1 for update/i;
const TIMELINE_INSERT = /insert into job_timeline_entries/i;

describe('PaymentsRepository.recordPayment', () => {
  it('records against a posted invoice and writes a paymentRecorded timeline entry', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_LOCK, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'main' }] },
      { match: /insert into payments/i, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [PAYMENT_ROW] }
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

  it('rejects a payment against a draft invoice and writes nothing', async () => {
    const { repository, calls } = repositoryWith([
      { match: INVOICE_LOCK, rows: [{ jobId: 'job-1', status: 'draft', invoiceKind: 'main' }] }
    ]);

    await expect(
      repository.recordPayment('inv-main', { amount: 50, method: 'cash', receivedAt: 'x', actor })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findCall(calls, /insert into payments/i)).toBeUndefined();
  });

  it('rejects a payment against a credit', async () => {
    const { repository } = repositoryWith([
      { match: INVOICE_LOCK, rows: [{ jobId: 'job-1', status: 'posted', invoiceKind: 'credit' }] }
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
        match: /from payments p\s+join invoices inv/i,
        rows: [{ jobId: 'job-1', isVoid: false, amount: '200.00' }]
      },
      { match: /update payments set/i, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 },
      { match: /from payments where id = \$1/i, rows: [{ ...PAYMENT_ROW, isVoid: true }] }
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
        match: /from payments p\s+join invoices inv/i,
        rows: [{ jobId: 'job-1', isVoid: true, amount: '200.00' }]
      }
    ]);

    await expect(repository.voidPayment('pay-1', undefined, actor)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(findCall(calls, TIMELINE_INSERT)).toBeUndefined();
  });
});
