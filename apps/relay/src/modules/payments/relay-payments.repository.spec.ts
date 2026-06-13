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

function repoWith(handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>) {
  const { database, calls } = scriptedDatabase(handlers);
  return { repo: new RelayPaymentsRepository(database as never), calls };
}

describe('RelayPaymentsRepository.refreshExpiredSession', () => {
  it('refreshes only the matching expired created row and clears stale paid fields', async () => {
    const refreshedRow = storedSession({
      stripe_checkout_session_id: 'cs_new',
      checkout_url: 'https://stripe.test/new',
      expires_at: new Date('2026-06-14T00:00:00.000Z'),
      updated_at: new Date('2026-06-13T12:00:00.000Z')
    });
    const { repo, calls } = repoWith([
      { match: /update relay_payment_sessions/i, rows: [refreshedRow], rowCount: 1 }
    ]);

    const refreshed = await repo.refreshExpiredSession({
      id: 'pay_sess_1',
      shopId: 'shop_1',
      request: {
        idempotencyKey: 'invoice-payment:job-1:84500',
        jobRef: 'job-1',
        invoiceRef: 'inv-1',
        amountCents: 84_500,
        currency: 'usd',
        description: 'BellField invoice 1001'
      },
      successUrl: 'https://relay.example/payment-return/success',
      cancelUrl: 'https://relay.example/payment-return/canceled',
      stripeConnectedAccountId: 'acct_good',
      stripeCheckoutSessionId: 'cs_new',
      stripePaymentIntentId: null,
      checkoutUrl: 'https://stripe.test/new',
      applicationFeeCents: 250,
      expiresAt: new Date('2026-06-14T00:00:00.000Z'),
      refreshedAt: new Date('2026-06-13T12:00:00.000Z')
    });

    expect(refreshed.checkoutUrl).toBe('https://stripe.test/new');
    const update = calls.find((c) => /update relay_payment_sessions/i.test(c.sql));
    expect(update?.sql).toMatch(/status = 'created'/i);
    expect(update?.sql).toMatch(/paid_at = null/i);
    expect(update?.sql).toMatch(/and status = 'created'/i);
    expect(update?.sql).toMatch(/and expires_at <= \$18/i);
    expect(update?.params.slice(0, 3)).toEqual([
      'pay_sess_1',
      'shop_1',
      'invoice-payment:job-1:84500'
    ]);
    expect(update?.params[6]).toBe('USD');
  });
});

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
