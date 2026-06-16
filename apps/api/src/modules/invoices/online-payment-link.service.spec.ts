import { OnlinePaymentLinkService } from './online-payment-link.service';
import type { OnlinePaymentSessionRecord } from './online-payments.repository';

const actor = { id: 'emp-1', displayName: 'Bea Bookkeeper' };

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue(actor)
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({ id: 'job-1', jobNumber: '1001' })
  };
  const invoicesRepository = {
    getInvoiceById: jest.fn().mockResolvedValue({
      id: 'inv-main',
      jobId: 'job-1',
      status: 'posted',
      invoiceKind: 'main',
      posted: { jobNumber: '1001' }
    }),
    listInvoiceTotalsForJob: jest.fn().mockResolvedValue([
      { invoiceKind: 'main', status: 'posted', total: 250 },
      { invoiceKind: 'adjustment', status: 'draft', total: 25 }
    ])
  };
  const paymentsRepository = {
    sumActivePaymentCentsForJob: jest.fn().mockResolvedValue(0),
    sumActiveRefundCentsForJob: jest.fn().mockResolvedValue(0)
  };
  const onlinePaymentsRepository = {
    listForJobAmount: jest.fn().mockResolvedValue([]),
    sumActiveCreatedSessionCentsForJob: jest.fn().mockResolvedValue(0),
    recordCreated: jest.fn()
  };
  onlinePaymentsRepository.recordCreated.mockImplementation(
    (input: { relayPaymentSessionId: string }) =>
      Promise.resolve({
        id: 'local-session-1',
        relayPaymentSessionId: input.relayPaymentSessionId
      })
  );

  return {
    service: new OnlinePaymentLinkService(
      identityAccessService as never,
      jobsDataService as never,
      invoicesRepository as never,
      paymentsRepository as never,
      onlinePaymentsRepository as never
    ),
    identityAccessService,
    jobsDataService,
    invoicesRepository,
    paymentsRepository,
    onlinePaymentsRepository
  };
}

// The service reads the real wall clock (`new Date()`), so the reuse/expiry
// branches must be tested against now-relative timestamps — a hard-coded date
// becomes a time bomb that flips once the clock passes it.
const unexpiredExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const expiredExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function paymentSession(
  overrides: Partial<OnlinePaymentSessionRecord> = {}
): OnlinePaymentSessionRecord {
  const createdAt = '2026-06-13T12:00:00.000Z';
  return {
    id: 'online-session-1',
    jobId: 'job-1',
    invoiceId: 'inv-main',
    relayPaymentSessionId: 'pay_sess_1',
    amount: 250,
    currency: 'USD',
    checkoutUrl: 'https://stripe.test/existing',
    status: 'created',
    purpose: 'payment',
    createdByName: 'Bea Bookkeeper',
    expiresAt: unexpiredExpiresAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function setupRelayEnv() {
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.example';
  process.env.BELLFIELD_RELAY_TOKEN = 'relay-token';
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'instance-1';
}

function clearRelayEnv() {
  delete process.env.BELLFIELD_RELAY_BASE_URL;
  delete process.env.BELLFIELD_RELAY_TOKEN;
  delete process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID;
}

function mockRelayCreated(paymentSessionId = 'pay_sess_new') {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      result: {
        kind: 'created',
        paymentSessionId,
        checkoutUrl: 'https://stripe.test/new',
        amountCents: 25_000,
        currency: 'USD',
        applicationFeeCents: 250,
        expiresAt: '2026-06-14T00:00:00.000Z'
      }
    })
  });
  global.fetch = fetchMock as never;
  return fetchMock;
}

function requestBody(fetchMock: jest.Mock): {
  amountCents: number;
  idempotencyKey: string;
  description?: string;
  invoiceRef?: string;
} {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected relay request body.');
  }
  return JSON.parse(body) as {
    amountCents: number;
    idempotencyKey: string;
    description?: string;
    invoiceRef?: string;
  };
}

describe('OnlinePaymentLinkService.createOnlinePaymentLink', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearRelayEnv();
    setupRelayEnv();
    mockRelayCreated();
  });

  afterEach(() => {
    clearRelayEnv();
    jest.restoreAllMocks();
  });

  it('creates the default full-due amount with an attempt-1 idempotency key', async () => {
    const fetchMock = mockRelayCreated('pay_sess_attempt_1');
    const { service, onlinePaymentsRepository } = createService();

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {});

    expect(result.state).toBe('created');
    expect(requestBody(fetchMock)).toEqual(
      expect.objectContaining({
        amountCents: 25_000,
        idempotencyKey: 'invoice-payment:job-1:inv-main:25000:attempt-1'
      })
    );
    expect(onlinePaymentsRepository.recordCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        relayPaymentSessionId: 'pay_sess_attempt_1',
        amount: 250,
        currency: 'USD'
      })
    );
  });

  it('creates a requested partial amount without changing the job balance', async () => {
    const fetchMock = mockRelayCreated('pay_sess_partial');
    const { service, onlinePaymentsRepository } = createService();

    const result = await service.createOnlinePaymentLink('token', 'inv-main', { amount: 100 });

    expect(result).toEqual(
      expect.objectContaining({
        state: 'created',
        amount: 100,
        currency: 'USD'
      })
    );
    expect(onlinePaymentsRepository.listForJobAmount).toHaveBeenCalledWith({
      jobId: 'job-1',
      invoiceId: 'inv-main',
      amount: 100,
      currency: 'USD'
    });
    expect(requestBody(fetchMock)).toEqual(
      expect.objectContaining({
        amountCents: 10_000,
        idempotencyKey: 'invoice-payment:job-1:inv-main:10000:attempt-1'
      })
    );
    expect(onlinePaymentsRepository.recordCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        relayPaymentSessionId: 'pay_sess_partial',
        amount: 100
      })
    );
  });

  it('includes the source invoice id in the idempotency key', async () => {
    const fetchMock = mockRelayCreated('pay_sess_adjustment');
    const { service, invoicesRepository } = createService();
    invoicesRepository.getInvoiceById.mockResolvedValueOnce({
      id: 'inv-adjustment',
      jobId: 'job-1',
      status: 'posted',
      invoiceKind: 'adjustment',
      posted: { jobNumber: '1001' }
    });

    const result = await service.createOnlinePaymentLink('token', 'inv-adjustment', {
      amount: 100
    });

    expect(result.state).toBe('created');
    expect(requestBody(fetchMock)).toEqual(
      expect.objectContaining({
        invoiceRef: 'inv-adjustment',
        idempotencyKey: 'invoice-payment:job-1:inv-adjustment:10000:attempt-1'
      })
    );
  });

  it('rejects a requested amount above the current amount due', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();

    await expect(
      service.createOnlinePaymentLink('token', 'inv-main', { amount: 250.01 })
    ).rejects.toThrow('Payment link amount cannot exceed the $250.00 currently due.');

    expect(onlinePaymentsRepository.listForJobAmount).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a requested amount with fractional cents', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();

    await expect(
      service.createOnlinePaymentLink('token', 'inv-main', { amount: 10.005 })
    ).rejects.toThrow('Payment link amount must be a positive dollar amount.');

    expect(onlinePaymentsRepository.listForJobAmount).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an unexpired local created session without calling the relay', async () => {
    clearRelayEnv();
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({ relayPaymentSessionId: 'pay_sess_existing' })
    ]);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {});

    expect(result).toEqual({
      state: 'created',
      checkoutUrl: 'https://stripe.test/existing',
      paymentSessionId: 'pay_sess_existing',
      amount: 250,
      currency: 'USD',
      expiresAt: unexpiredExpiresAt,
      reusedExisting: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlinePaymentsRepository.recordCreated).not.toHaveBeenCalled();
  });

  it('creates the next attempt after an expired local created session', async () => {
    const fetchMock = mockRelayCreated('pay_sess_attempt_2');
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({ expiresAt: expiredExpiresAt })
    ]);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {});

    expect(result.state).toBe('created');
    expect(requestBody(fetchMock).idempotencyKey).toBe(
      'invoice-payment:job-1:inv-main:25000:attempt-2'
    );
  });

  it('requires confirmation before a new same-amount link after a paid online session', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({ status: 'paid', paymentId: 'pay-1', paidAt: '2026-06-13T13:00:00.000Z' })
    ]);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {});

    expect(result).toEqual({
      state: 'confirmationRequired',
      code: 'sameAmountPreviouslyPaid',
      amount: 250,
      currency: 'USD',
      message:
        'This job already had an online card payment for $250.00. BellField still shows $250.00 due.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlinePaymentsRepository.recordCreated).not.toHaveBeenCalled();
  });

  it('uses the requested amount in the same-amount confirmation while showing full due', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({
        amount: 100,
        status: 'paid',
        paymentId: 'pay-1',
        paidAt: '2026-06-13T13:00:00.000Z'
      })
    ]);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', { amount: 100 });

    expect(result).toEqual({
      state: 'confirmationRequired',
      code: 'sameAmountPreviouslyPaid',
      amount: 100,
      currency: 'USD',
      message:
        'This job already had an online card payment for $100.00. BellField still shows $250.00 due.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlinePaymentsRepository.recordCreated).not.toHaveBeenCalled();
  });

  it('creates the next attempt when same-amount payment is confirmed by the office', async () => {
    const fetchMock = mockRelayCreated('pay_sess_attempt_2');
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({ status: 'paid', paymentId: 'pay-1', paidAt: '2026-06-13T13:00:00.000Z' })
    ]);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {
      confirmSameAmountCharge: true
    });

    expect(result.state).toBe('created');
    expect(requestBody(fetchMock).idempotencyKey).toBe(
      'invoice-payment:job-1:inv-main:25000:attempt-2'
    );
  });

  it('requires confirmation when active unpaid links could exceed the amount due', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.sumActiveCreatedSessionCentsForJob.mockResolvedValue(20_000);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', { amount: 100 });

    expect(result).toEqual({
      state: 'confirmationRequired',
      code: 'activeLinksMayExceedDue',
      amount: 100,
      currency: 'USD',
      message:
        'This job already has $200.00 in active unpaid online payment links. Creating another $100.00 link could let the customer pay more than the $250.00 currently due. Any overpayment will be held as job credit.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlinePaymentsRepository.recordCreated).not.toHaveBeenCalled();
  });

  it('creates the link when active-link overage is confirmed by the office', async () => {
    const fetchMock = mockRelayCreated('pay_sess_overage_confirmed');
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.sumActiveCreatedSessionCentsForJob.mockResolvedValue(20_000);

    const result = await service.createOnlinePaymentLink('token', 'inv-main', {
      amount: 100,
      confirmActiveLinkOverage: true
    });

    expect(result.state).toBe('created');
    expect(requestBody(fetchMock).idempotencyKey).toBe(
      'invoice-payment:job-1:inv-main:10000:attempt-1'
    );
  });

  it('uses the same attempt key for repeated same-state requests before local persistence changes', async () => {
    const fetchMock = mockRelayCreated('pay_sess_attempt_1');
    const { service } = createService();

    await service.createOnlinePaymentLink('token', 'inv-main', {});
    await service.createOnlinePaymentLink('token', 'inv-main', {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock).idempotencyKey).toBe(
      'invoice-payment:job-1:inv-main:25000:attempt-1'
    );
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      idempotencyKey: string;
    };
    expect(secondBody.idempotencyKey).toBe('invoice-payment:job-1:inv-main:25000:attempt-1');
  });
});

describe('OnlinePaymentLinkService.createDepositPaymentLink', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearRelayEnv();
    setupRelayEnv();
    mockRelayCreated();
  });

  afterEach(() => {
    clearRelayEnv();
    jest.restoreAllMocks();
  });

  it('creates a job-level deposit link without an invoice reference', async () => {
    const fetchMock = mockRelayCreated('pay_sess_deposit');
    const { service, onlinePaymentsRepository } = createService();

    const result = await service.createDepositPaymentLink('token', 'job-1', { amount: 100 });

    expect(result).toEqual(
      expect.objectContaining({
        state: 'created',
        amount: 100,
        currency: 'USD'
      })
    );
    expect(onlinePaymentsRepository.listForJobAmount).toHaveBeenCalledWith({
      jobId: 'job-1',
      invoiceId: null,
      amount: 100,
      currency: 'USD'
    });
    expect(requestBody(fetchMock)).toEqual(
      expect.objectContaining({
        amountCents: 10_000,
        idempotencyKey: 'deposit-payment:job-1:deposit:10000:attempt-1'
      })
    );
    const relayBody = requestBody(fetchMock);
    expect(relayBody.invoiceRef).toBeUndefined();
    expect(relayBody.description).toBe('BellField deposit for job 1001');
    expect(onlinePaymentsRepository.recordCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        invoiceId: null,
        relayPaymentSessionId: 'pay_sess_deposit',
        amount: 100,
        purpose: 'deposit'
      })
    );
  });

  it('requires confirmation before a repeat same-amount deposit after payment', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();
    onlinePaymentsRepository.listForJobAmount.mockResolvedValue([
      paymentSession({
        invoiceId: undefined,
        amount: 100,
        status: 'paid',
        paymentId: 'pay-1',
        paidAt: '2026-06-13T13:00:00.000Z'
      })
    ]);

    const result = await service.createDepositPaymentLink('token', 'job-1', { amount: 100 });

    expect(result).toEqual({
      state: 'confirmationRequired',
      code: 'sameAmountPreviouslyPaid',
      amount: 100,
      currency: 'USD',
      message: 'This job already had an online card deposit for $100.00.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlinePaymentsRepository.recordCreated).not.toHaveBeenCalled();
  });

  it('rejects a deposit amount with fractional cents', async () => {
    const fetchMock = mockRelayCreated();
    const { service, onlinePaymentsRepository } = createService();

    await expect(
      service.createDepositPaymentLink('token', 'job-1', { amount: 10.005 })
    ).rejects.toThrow('Deposit link amount must be a positive dollar amount.');

    expect(onlinePaymentsRepository.listForJobAmount).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
