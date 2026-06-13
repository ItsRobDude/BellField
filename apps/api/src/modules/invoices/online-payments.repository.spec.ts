import { OnlinePaymentsRepository } from './online-payments.repository';

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
      expect.stringContaining('order by created_at asc, id asc'),
      ['job-1', 250, 'USD']
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
