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
  const queries: string[] = [];
  const query = jest.fn(async (sql: string) => {
    queries.push(sql);
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

    expect(queries.some((sql) => /insert into job_timeline_entries/i.test(sql))).toBe(true);
  });

  it('skips the timeline entry when the upsert took the conflict-update path', async () => {
    const { repository, queries } = recordCreatedHarness(false);

    await repository.recordCreated(recordCreatedInput);

    expect(queries.some((sql) => /insert into job_timeline_entries/i.test(sql))).toBe(false);
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
      amount: 250,
      currency: 'usd'
    });

    expect(databaseService.query).toHaveBeenCalledWith(
      expect.stringMatching(/round\(amount \* 100\) = \$2[\s\S]*order by created_at asc, id asc/),
      ['job-1', 25_000, 'USD']
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
});
