import { RelayPaymentsRepository } from './relay-payments.repository';

// Scripted queryable mirroring the API payments.repository spec: match each SQL
// by fragment, return canned rows, record calls. Lets us exercise the
// recordPaidEvent reconciliation branches without a live database.
function scriptedDatabase(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryable = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const handler = handlers.find((h) => h.match.test(sql));
      return { rows: handler?.rows ?? [], rowCount: handler?.rowCount ?? 0 };
    }
  };
  const database = {
    query: queryable.query,
    transaction: async (work: (q: typeof queryable) => unknown) => work(queryable)
  };
  return { database, calls };
}

function storedSession(overrides?: Partial<Record<string, unknown>>) {
  const createdAt = new Date('2026-06-13T00:00:00.000Z');
  return {
    id: 'pay_sess_1',
    shop_id: 'shop_1',
    idempotency_key: 'invoice-payment:job-1:84500',
    job_ref: 'job-1',
    invoice_ref: 'inv-1',
    amount_cents: 84_500,
    currency: 'USD',
    description: 'BellField invoice 1001',
    customer_email: null,
    success_url: 'https://relay.example/payment-return/success',
    cancel_url: 'https://relay.example/payment-return/canceled',
    stripe_connected_account_id: 'acct_good',
    stripe_checkout_session_id: 'cs_1',
    stripe_payment_intent_id: null,
    checkout_url: 'https://stripe.test/checkout',
    status: 'created',
    application_fee_cents: 250,
    expires_at: new Date('2026-06-13T01:00:00.000Z'),
    paid_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides
  };
}

const baseInput = {
  stripeEventId: 'evt_1',
  stripeCheckoutSessionId: 'cs_1',
  stripePaymentIntentId: 'pi_1',
  connectedAccountId: 'acct_good',
  amountCents: 84_500,
  currency: 'USD',
  paidAt: new Date('2026-06-13T00:00:00.000Z'),
  occurredAt: new Date('2026-06-13T00:00:01.000Z')
};

const SESSION_SELECT = /from relay_payment_sessions\s+where stripe_checkout_session_id = \$1/i;
const EVENT_INSERT = /insert into relay_payment_events/i;
const CREATED_SESSIONS_SELECT =
  /from relay_payment_sessions[\s\S]*where shop_id = \$1[\s\S]*status = 'created'/i;

function repoWith(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const { database, calls } = scriptedDatabase(handlers);
  return { repo: new RelayPaymentsRepository(database as never), calls };
}

describe('RelayPaymentsRepository.recordPaidEvent', () => {
  it('records a matching paid event', async () => {
    const { repo, calls } = repoWith([
      { match: SESSION_SELECT, rows: [storedSession()] },
      { match: /update relay_payment_sessions/i, rowCount: 1 },
      { match: EVENT_INSERT, rowCount: 1 }
    ]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('recorded');
    expect(calls.some((c) => EVENT_INSERT.test(c.sql))).toBe(true);
  });

  it('no-ops when no session matches the checkout id', async () => {
    const { repo, calls } = repoWith([{ match: SESSION_SELECT, rows: [] }]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('sessionNotFound');
    expect(calls.some((c) => EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses an amount that disagrees with the stored session', async () => {
    const { repo, calls } = repoWith([
      { match: SESSION_SELECT, rows: [storedSession({ amount_cents: 99_999 })] }
    ]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses a currency that disagrees with the stored session', async () => {
    const { repo, calls } = repoWith([
      { match: SESSION_SELECT, rows: [storedSession({ currency: 'CAD' })] }
    ]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses a connected account that disagrees with the stored session', async () => {
    const { repo, calls } = repoWith([
      {
        match: SESSION_SELECT,
        rows: [storedSession({ stripe_connected_account_id: 'acct_other' })]
      }
    ]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('reports a duplicate (conflict no-op) without throwing', async () => {
    const { repo } = repoWith([
      { match: SESSION_SELECT, rows: [storedSession()] },
      { match: /update relay_payment_sessions/i, rowCount: 1 },
      { match: EVENT_INSERT, rowCount: 0 }
    ]);
    const outcome = await repo.recordPaidEvent(baseInput);
    expect(outcome).toBe('duplicate');
  });

  it('tolerates either unique index via unqualified ON CONFLICT DO NOTHING', async () => {
    const { repo, calls } = repoWith([
      { match: SESSION_SELECT, rows: [storedSession()] },
      { match: /update relay_payment_sessions/i, rowCount: 1 },
      { match: EVENT_INSERT, rowCount: 0 }
    ]);
    await repo.recordPaidEvent(baseInput);
    const insert = calls.find((c) => EVENT_INSERT.test(c.sql));
    expect(insert?.sql).toMatch(/on conflict do nothing/i);
    expect(insert?.sql).not.toMatch(/on conflict \(/i);
  });
});

describe('RelayPaymentsRepository.listCreatedPaymentSessionsForReconciliation', () => {
  it('returns recent created sessions for Stripe poll reconciliation', async () => {
    const { repo, calls } = repoWith([
      { match: CREATED_SESSIONS_SELECT, rows: [storedSession({ id: 'pay_sess_created' })] }
    ]);

    const sessions = await repo.listCreatedPaymentSessionsForReconciliation('shop_1', 25);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('pay_sess_created');
    const query = calls.find((c) => CREATED_SESSIONS_SELECT.test(c.sql));
    expect(query?.sql).toMatch(/expires_at > now\(\) - interval '1 day'/i);
    expect(query?.sql).toMatch(/order by created_at desc/i);
    expect(query?.params).toEqual(['shop_1', 25]);
  });
});

const REFUND_REQUEST_SELECT = /from relay_payment_refund_requests r/i;
const REFUND_EVENT_INSERT = /insert into relay_payment_refund_events/i;
const REFUND_REQUEST_UPDATE = /update relay_payment_refund_requests/i;
// recordRefundEvent now resolves the request in two ordered lookups — by Stripe
// refund id first, then by the metadata request id only as a fallback — so tests
// that exercise the fallback must distinguish the two queries by their where clause.
const REFUND_SELECT_BY_REFUND_ID =
  /from relay_payment_refund_requests r[\s\S]*where r\.stripe_refund_id = \$1/i;
const REFUND_SELECT_BY_REQUEST_ID = /from relay_payment_refund_requests r[\s\S]*where r\.id = \$1/i;

function storedRefundRequest(overrides?: Partial<Record<string, unknown>>) {
  const createdAt = new Date('2026-06-14T00:00:00.000Z');
  return {
    id: 'pay_refund_1',
    shop_id: 'shop_1',
    payment_session_id: 'pay_sess_1',
    idempotency_key: 'invoice-refund:pay-1:30000',
    amount_cents: 30_000,
    currency: 'USD',
    reason: null,
    stripe_connected_account_id: 'acct_good',
    stripe_payment_intent_id: 'pi_1',
    stripe_refund_id: 're_1',
    application_fee_refunded_cents: 300,
    status: 'requested',
    failure_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
    stripe_checkout_session_id: 'cs_1',
    ...overrides
  };
}

const baseRefundEvent = {
  stripeEventId: 'evt_re_succeeded',
  stripeRefundId: 're_1',
  refundRequestId: 'pay_refund_1',
  connectedAccountId: 'acct_good',
  paymentIntentId: 'pi_1',
  status: 'succeeded' as const,
  amountCents: 30_000,
  currency: 'USD',
  failureReason: null,
  occurredAt: new Date('2026-06-14T12:00:00.000Z')
};

describe('RelayPaymentsRepository.recordRefundEvent', () => {
  it('records a matching succeeded refund event and advances the request', async () => {
    const { repo, calls } = repoWith([
      { match: REFUND_REQUEST_SELECT, rows: [storedRefundRequest()] },
      { match: REFUND_EVENT_INSERT, rowCount: 1 },
      { match: REFUND_REQUEST_UPDATE, rowCount: 1 }
    ]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('recorded');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(true);
    expect(calls.some((c) => REFUND_REQUEST_UPDATE.test(c.sql))).toBe(true);
  });

  it('reports requestNotFound for an out-of-band refund (no matching request)', async () => {
    const { repo, calls } = repoWith([{ match: REFUND_REQUEST_SELECT, rows: [] }]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('requestNotFound');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses a connected account that disagrees with the request', async () => {
    const { repo, calls } = repoWith([
      {
        match: REFUND_REQUEST_SELECT,
        rows: [storedRefundRequest({ stripe_connected_account_id: 'acct_other' })]
      }
    ]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses a PaymentIntent that disagrees with the request', async () => {
    const { repo, calls } = repoWith([
      {
        match: REFUND_REQUEST_SELECT,
        rows: [storedRefundRequest({ stripe_payment_intent_id: 'pi_other' })]
      }
    ]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('does not flip request status when a contradicting terminal event is a duplicate', async () => {
    // A 'failed' webhook arrives after the refund already succeeded: the event
    // insert conflicts (same shop+refund id) and no-ops, so status must NOT flip.
    const { repo, calls } = repoWith([
      { match: REFUND_REQUEST_SELECT, rows: [storedRefundRequest({ status: 'succeeded' })] },
      { match: REFUND_EVENT_INSERT, rowCount: 0 }
    ]);
    const outcome = await repo.recordRefundEvent({
      ...baseRefundEvent,
      stripeEventId: 'evt_re_failed',
      status: 'failed',
      failureReason: 'card_declined'
    });
    expect(outcome).toBe('duplicate');
    expect(calls.some((c) => REFUND_REQUEST_UPDATE.test(c.sql))).toBe(false);
  });

  it('backfills the Stripe refund id when matched via request metadata', async () => {
    // The refund id is not yet persisted, so the by-refund-id lookup misses and we
    // fall back to the metadata request id, then backfill the id when advancing.
    const { repo, calls } = repoWith([
      { match: REFUND_SELECT_BY_REFUND_ID, rows: [] },
      {
        match: REFUND_SELECT_BY_REQUEST_ID,
        rows: [storedRefundRequest({ stripe_refund_id: null })]
      },
      { match: REFUND_EVENT_INSERT, rowCount: 1 },
      { match: REFUND_REQUEST_UPDATE, rowCount: 1 }
    ]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('recorded');
    const update = calls.find((c) => REFUND_REQUEST_UPDATE.test(c.sql));
    expect(update?.sql).toMatch(/stripe_refund_id = coalesce\(stripe_refund_id/i);
    expect(update?.params).toContain('re_1');
  });

  it('refuses when the matched refund id and metadata request id disagree', async () => {
    // A webhook carrying a refund id AND a metadata request id that resolve to
    // different requests is contradictory: advance neither, just log + ignore.
    const { repo, calls } = repoWith([
      { match: REFUND_REQUEST_SELECT, rows: [storedRefundRequest()] }
    ]);
    const outcome = await repo.recordRefundEvent({
      ...baseRefundEvent,
      refundRequestId: 'pay_refund_other'
    });
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(false);
  });

  it('refuses when the metadata request is already bound to another refund id', async () => {
    // No row matches this refund id; the metadata request resolves but is already
    // bound to a different Stripe refund, so this event can't belong to it.
    const { repo, calls } = repoWith([
      { match: REFUND_SELECT_BY_REFUND_ID, rows: [] },
      {
        match: REFUND_SELECT_BY_REQUEST_ID,
        rows: [storedRefundRequest({ stripe_refund_id: 're_other' })]
      }
    ]);
    const outcome = await repo.recordRefundEvent(baseRefundEvent);
    expect(outcome).toBe('mismatch');
    expect(calls.some((c) => REFUND_EVENT_INSERT.test(c.sql))).toBe(false);
  });
});
