import { ConflictException, NotFoundException } from '@nestjs/common';
import { OnlineRefundsRepository } from './online-refunds.repository';
import type { QueryExecutor } from '../../database/database.service';

// Scripted database: match each query by an SQL fragment, return a canned result,
// record every call. Mirrors payments.repository.spec.ts but also stubs the
// non-transactional `query` the mark* helpers use.
function scriptedDatabase(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const run = (async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers.find((h) => h.match.test(sql));
    return { rows: handler?.rows ?? [], rowCount: handler?.rowCount ?? 0 };
  }) as QueryExecutor['query'];
  const databaseService = {
    query: run,
    transaction: (async (work: (q: QueryExecutor) => unknown) => work({ query: run })) as never
  };
  return { databaseService, calls };
}

function repositoryWith(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const { databaseService, calls } = scriptedDatabase(handlers);
  return { repository: new OnlineRefundsRepository(databaseService as never), calls };
}

function findCall(calls: Array<{ sql: string; params: unknown[] }>, fragment: RegExp) {
  return calls.find((c) => fragment.test(c.sql));
}

const PAYMENT_HEAD = /from payments where id = \$1 limit 1/i;
const JOB_LOCK = /select id from jobs where id = \$1 for update/i;
const PAYMENT_LOCK = /from payments where id = \$1 for update/i;
const REUSE_LOOKUP =
  /from online_refund_requests\s+where payment_id = \$1 and round\(amount \* 100\) = \$2 and status = 'requested'/i;
const CONFIRMED_SUM = /from payment_refunds\s+where payment_id = \$1/i;
const OUTSTANDING_SUM =
  /sum\(amount\) \* 100\), 0\) as cents\s+from online_refund_requests\s+where payment_id = \$1 and status = 'requested'/i;
const PRIOR_COUNT = /select count\(\*\) as count\s+from online_refund_requests/i;
const REQUEST_INSERT = /insert into online_refund_requests/i;
const REQUEST_UPDATE = /update online_refund_requests/i;

function onlinePaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    amount: '200.00',
    currency: 'USD',
    source: 'bellfield_payments',
    provider: 'stripe',
    method: 'card',
    providerSessionId: 'cs_1',
    isVoid: false,
    ...overrides
  };
}

const actor = { id: 'emp-1', displayName: 'Bea Bookkeeper' };

describe('OnlineRefundsRepository.createOrReusePending', () => {
  it('opens a pending request with an attempt-1 key when nothing prior exists', async () => {
    const { repository, calls } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow()] },
      { match: REUSE_LOOKUP, rows: [] },
      { match: CONFIRMED_SUM, rows: [{ cents: 0 }] },
      { match: OUTSTANDING_SUM, rows: [{ cents: 0 }] },
      { match: PRIOR_COUNT, rows: [{ count: 0 }] },
      { match: REQUEST_INSERT, rowCount: 1 }
    ]);

    const pending = await repository.createOrReusePending('pay-1', {
      amount: 50,
      reason: 'duplicate charge',
      actor
    });

    expect(pending).toEqual({
      id: expect.any(String),
      idempotencyKey: 'online-refund:pay-1:5000:attempt-1',
      providerSessionId: 'cs_1',
      amount: 50,
      currency: 'USD',
      reused: false
    });
    const insert = findCall(calls, REQUEST_INSERT);
    expect(insert?.params).toContain('online-refund:pay-1:5000:attempt-1');
    expect(insert?.params).toContain('job-1');
  });

  it('reuses an outstanding request for the same payment and amount', async () => {
    const { repository, calls } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow()] },
      {
        match: REUSE_LOOKUP,
        rows: [{ id: 'orr-existing', idempotencyKey: 'online-refund:pay-1:5000:attempt-1' }]
      }
    ]);

    const pending = await repository.createOrReusePending('pay-1', { amount: 50, actor });

    expect(pending).toEqual({
      id: 'orr-existing',
      idempotencyKey: 'online-refund:pay-1:5000:attempt-1',
      providerSessionId: 'cs_1',
      amount: 50,
      currency: 'USD',
      reused: true
    });
    expect(findCall(calls, REQUEST_INSERT)).toBeUndefined();
  });

  it('uses the next attempt key after a prior settled refund of the same amount', async () => {
    const { repository, calls } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow()] },
      { match: REUSE_LOOKUP, rows: [] },
      // A prior $50 refund already settled into payment_refunds.
      { match: CONFIRMED_SUM, rows: [{ cents: 5000 }] },
      { match: OUTSTANDING_SUM, rows: [{ cents: 0 }] },
      { match: PRIOR_COUNT, rows: [{ count: 1 }] },
      { match: REQUEST_INSERT, rowCount: 1 }
    ]);

    const pending = await repository.createOrReusePending('pay-1', { amount: 50, actor });

    expect(pending.idempotencyKey).toBe('online-refund:pay-1:5000:attempt-2');
    expect(findCall(calls, REQUEST_INSERT)?.params).toContain('online-refund:pay-1:5000:attempt-2');
  });

  it('rejects a refund that exceeds the remaining refundable', async () => {
    const { repository, calls } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow()] },
      { match: REUSE_LOOKUP, rows: [] },
      { match: CONFIRMED_SUM, rows: [{ cents: 15_000 }] },
      { match: OUTSTANDING_SUM, rows: [{ cents: 0 }] }
    ]);

    // $200 payment, $150 already refunded → $50 refundable, asking for $60.
    await expect(
      repository.createOrReusePending('pay-1', { amount: 60, actor })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findCall(calls, REQUEST_INSERT)).toBeUndefined();
  });

  it('counts outstanding requests against the remaining refundable', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow()] },
      // No requested row at THIS amount, but $180 already pending at other amounts.
      { match: REUSE_LOOKUP, rows: [] },
      { match: CONFIRMED_SUM, rows: [{ cents: 0 }] },
      { match: OUTSTANDING_SUM, rows: [{ cents: 18_000 }] }
    ]);

    await expect(
      repository.createOrReusePending('pay-1', { amount: 50, actor })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects refunding a voided payment', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow({ isVoid: true })] }
    ]);

    await expect(repository.createOrReusePending('pay-1', { amount: 50, actor })).rejects.toThrow(
      'A voided payment cannot be refunded.'
    );
  });

  it('rejects refunding a manually recorded payment through this path', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      {
        match: PAYMENT_LOCK,
        rows: [onlinePaymentRow({ source: 'manual', providerSessionId: null })]
      }
    ]);

    await expect(repository.createOrReusePending('pay-1', { amount: 50, actor })).rejects.toThrow(
      'manually recorded payment'
    );
  });

  it('rejects a payment whose provider is not Stripe', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow({ provider: null })] }
    ]);

    await expect(repository.createOrReusePending('pay-1', { amount: 50, actor })).rejects.toThrow(
      'cannot be refunded online'
    );
  });

  it('rejects a payment that is not a card charge', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow({ method: 'ach' })] }
    ]);

    await expect(repository.createOrReusePending('pay-1', { amount: 50, actor })).rejects.toThrow(
      'cannot be refunded online'
    );
  });

  it('rejects an online payment with no relay session to refund against', async () => {
    const { repository } = repositoryWith([
      { match: PAYMENT_HEAD, rows: [{ jobId: 'job-1' }] },
      { match: JOB_LOCK, rows: [{ id: 'job-1' }] },
      { match: PAYMENT_LOCK, rows: [onlinePaymentRow({ providerSessionId: null })] }
    ]);

    await expect(repository.createOrReusePending('pay-1', { amount: 50, actor })).rejects.toThrow(
      'cannot be refunded online'
    );
  });

  it('throws NotFound when the payment does not exist', async () => {
    const { repository } = repositoryWith([{ match: PAYMENT_HEAD, rows: [] }]);
    await expect(
      repository.createOrReusePending('missing', { amount: 50, actor })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OnlineRefundsRepository mark* outcomes', () => {
  it('records relay ids without flipping the request out of requested', async () => {
    const { repository, calls } = repositoryWith([{ match: REQUEST_UPDATE, rowCount: 1 }]);
    await repository.markRelayAccepted({
      id: 'orr-1',
      relayRefundRequestId: 'rr-1',
      providerRefundId: 're_1'
    });
    const update = findCall(calls, REQUEST_UPDATE);
    expect(update?.sql).not.toMatch(/status = /i);
    expect(update?.params).toEqual(expect.arrayContaining(['orr-1', 'rr-1', 're_1']));
  });

  it('records a transient relay error without changing status', async () => {
    const { repository, calls } = repositoryWith([{ match: REQUEST_UPDATE, rowCount: 1 }]);
    await repository.markRelayError({ id: 'orr-1', lastError: 'boom' });
    const update = findCall(calls, REQUEST_UPDATE);
    expect(update?.sql).toMatch(/last_error = \$2/i);
    expect(update?.sql).not.toMatch(/status = /i);
    expect(update?.params).toEqual(expect.arrayContaining(['orr-1', 'boom']));
  });

  it('marks a request terminally failed with a reason', async () => {
    const { repository, calls } = repositoryWith([{ match: REQUEST_UPDATE, rowCount: 1 }]);
    await repository.markFailed({ id: 'orr-1', failureReason: 'amount exceeds refundable' });
    const update = findCall(calls, REQUEST_UPDATE);
    expect(update?.sql).toMatch(/status = 'failed'/i);
    expect(update?.params).toEqual(expect.arrayContaining(['orr-1', 'amount exceeds refundable']));
  });
});

const LIST_FOR_JOB = /select distinct on \(payment_id\)[\s\S]*from online_refund_requests/i;

describe('OnlineRefundsRepository.listForJob', () => {
  it('reads the current pending/failed request per payment and normalizes amounts', async () => {
    const { repository, calls } = repositoryWith([
      {
        match: LIST_FOR_JOB,
        rows: [
          {
            id: 'orr-1',
            paymentId: 'pay-1',
            amount: '30.00',
            currency: 'USD',
            status: 'requested',
            providerRefundId: 're_1',
            applyAttemptCount: 0,
            requestedAt: '2026-06-15T00:00:00.000Z'
          },
          {
            id: 'orr-2',
            paymentId: 'pay-2',
            amount: '40.00',
            currency: 'USD',
            status: 'failed',
            providerRefundId: null,
            applyAttemptCount: 0,
            requestedAt: '2026-06-15T00:05:00.000Z'
          }
        ]
      }
    ]);

    const items = await repository.listForJob('job-1');

    expect(items).toEqual([
      {
        id: 'orr-1',
        paymentId: 'pay-1',
        amount: 30,
        currency: 'USD',
        status: 'requested',
        providerRefundId: 're_1',
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:00:00.000Z'
      },
      {
        id: 'orr-2',
        paymentId: 'pay-2',
        amount: 40,
        currency: 'USD',
        status: 'failed',
        providerRefundId: null,
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:05:00.000Z'
      }
    ]);
    const query = findCall(calls, LIST_FOR_JOB);
    expect(query?.sql).toMatch(/status in \('requested', 'failed'\)/i);
    expect(query?.params).toEqual(['job-1']);
  });
});
