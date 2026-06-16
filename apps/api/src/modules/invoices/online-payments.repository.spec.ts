import { OnlinePaymentsRepository } from './online-payments.repository';

const recordCreatedInput = {
  jobId: 'job-1',
  invoiceId: 'inv-main',
  relayPaymentSessionId: 'pay_sess_1',
  amount: 250,
  currency: 'USD',
  checkoutUrl: 'https://stripe.test/pay/cs_1',
  createdByEmployeeId: 'emp-1',
  createdByName: 'Bea Bookkeeper',
  expiresAt: '2026-06-14T00:00:00.000Z'
};

// Drives recordCreated against a fake transaction whose upsert reports whether
// the row was a fresh insert (xmax = 0) or a conflict-update.
function recordCreatedHarness(inserted: boolean) {
  const sessionRow = {
    id: 'online-session-1',
    jobId: 'job-1',
    invoiceId: 'inv-main',
    relayPaymentSessionId: 'pay_sess_1',
    amount: '250.00',
    currency: 'USD',
    checkoutUrl: 'https://stripe.test/pay/cs_1',
    status: 'created',
    createdByName: 'Bea Bookkeeper',
    expiresAt: '2026-06-14T00:00:00.000Z',
    paidAt: null,
    paymentId: null,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z'
  };
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (/insert into online_payment_sessions/i.test(sql)) {
      return { rows: [{ ...sessionRow, inserted }] };
    }
    return { rows: [] };
  });
  const databaseService = {
    transaction: jest.fn((cb: (queryable: { query: typeof query }) => unknown) => cb({ query }))
  };
  return { repository: new OnlinePaymentsRepository(databaseService as never), queries };
}

describe('OnlinePaymentsRepository.recordCreated', () => {
  it('writes a creation timeline entry when the session row is newly inserted', async () => {
    const { repository, queries } = recordCreatedHarness(true);

    await repository.recordCreated(recordCreatedInput);

    expect(queries.some((query) => /insert into job_timeline_entries/i.test(query.sql))).toBe(true);
  });

  it('skips the timeline entry when the upsert took the conflict-update path', async () => {
    const { repository, queries } = recordCreatedHarness(false);

    await repository.recordCreated(recordCreatedInput);

    expect(queries.some((query) => /insert into job_timeline_entries/i.test(query.sql))).toBe(
      false
    );
  });

  it('writes deposit-specific timeline copy when a deposit link is created', async () => {
    const { repository, queries } = recordCreatedHarness(true);

    await repository.recordCreated({
      ...recordCreatedInput,
      invoiceId: null,
      purpose: 'deposit'
    });

    const timeline = queries.find((query) => /insert into job_timeline_entries/i.test(query.sql));
    expect(timeline?.params).toEqual(
      expect.arrayContaining(['paymentLinkCreated', 'Deposit link created for $250.00.'])
    );
  });
});

describe('OnlinePaymentsRepository.listForJobAmount', () => {
  it('looks up same job/amount sessions in stable history order', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'online-session-1',
            jobId: 'job-1',
            invoiceId: null,
            relayPaymentSessionId: 'pay_sess_1',
            amount: '250.00',
            currency: 'USD',
            checkoutUrl: 'https://stripe.test/pay/cs_1',
            status: 'created',
            createdByName: 'Bea Bookkeeper',
            expiresAt: '2026-06-14T00:00:00.000Z',
            paidAt: null,
            paymentId: null,
            createdAt: '2026-06-13T00:00:00.000Z',
            updatedAt: '2026-06-13T00:00:00.000Z'
          }
        ]
      })
    };
    const repository = new OnlinePaymentsRepository(databaseService as never);

    const result = await repository.listForJobAmount({
      jobId: 'job-1',
      invoiceId: 'inv-main',
      amount: 250,
      currency: 'usd'
    });

    expect(databaseService.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /round\(amount \* 100\) = \$2[\s\S]*invoice_id = \$4[\s\S]*order by created_at asc, id asc/
      ),
      ['job-1', 25_000, 'USD', 'inv-main']
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'online-session-1',
        invoiceId: undefined,
        amount: 250,
        currency: 'USD',
        expiresAt: '2026-06-14T00:00:00.000Z'
      })
    ]);
  });

  it('looks up deposit sessions with no invoice id', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    const repository = new OnlinePaymentsRepository(databaseService as never);

    await repository.listForJobAmount({
      jobId: 'job-1',
      invoiceId: null,
      amount: 100,
      currency: 'usd'
    });

    expect(databaseService.query).toHaveBeenCalledWith(expect.any(String), [
      'job-1',
      10_000,
      'USD',
      null
    ]);
  });
});
