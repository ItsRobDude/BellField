import type { OnlinePaymentsDisabledReason } from '@bellfield/contracts';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import { RelayPaymentsService } from './payments.service';
import type { StripeWebhookEvent } from './stripe-payments.service';
import type {
  RecordPaidEventOutcome,
  RecordRefundEventOutcome,
  RelayPaymentRefundRequestRecord,
  RelayPaymentSessionRecord,
  RelayPaymentsStore,
  StripeCheckoutSessionReadResult
} from './payments.types';

const shop: AuthenticatedRelayShop = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  monthlySendQuota: 1000,
  tokenId: 'token_1',
  instanceId: 'instance-a'
};

function makeService(overrides?: {
  existingSession?: RelayPaymentSessionRecord | null;
  recordPaidEvent?: (input: unknown) => Promise<RecordPaidEventOutcome>;
  config?: {
    paymentsStatus?: 'enabled' | 'disabled';
    paymentsSetupStatus?: OnlinePaymentsDisabledReason | 'ready';
    connectedAccount?: string | null;
  };
  existingRefundRequest?: RelayPaymentRefundRequestRecord | null;
  paidSession?: RelayPaymentSessionRecord | null;
  consumedRefundCents?: number;
  recordRefundOutcome?: RecordRefundEventOutcome;
  createRefundThrows?: boolean;
  createdSessionsForReconciliation?: RelayPaymentSessionRecord[];
  retrieveCheckoutSession?: (
    input: Record<string, unknown>
  ) => Promise<StripeCheckoutSessionReadResult>;
  retrieveCheckoutSessionThrows?: boolean;
}) {
  const recordPaidEventCalls: unknown[] = [];
  const recordRefundEventCalls: unknown[] = [];
  let recordSessionInput: Parameters<RelayPaymentsStore['recordSession']>[0] | undefined;
  let createCheckoutInput: Record<string, unknown> | undefined;
  let createRefundRequestInput:
    | Parameters<RelayPaymentsStore['createRefundRequest']>[0]
    | undefined;
  let createRefundInput: Record<string, unknown> | undefined;
  let setRefundStripeIdInput:
    | Parameters<RelayPaymentsStore['setRefundRequestStripeRefundId']>[0]
    | undefined;
  const retrieveCheckoutSessionCalls: Record<string, unknown>[] = [];

  const store: RelayPaymentsStore = {
    withPaymentSessionLock: async <T>(_shopId: string, _key: string, cb: () => Promise<T>) => cb(),
    findSessionByIdempotencyKey: async () => overrides?.existingSession ?? null,
    findShopPaymentsConfig: async () => ({
      shopId: 'shop_1',
      paymentsStatus: overrides?.config?.paymentsStatus ?? 'enabled',
      paymentsSetupStatus: overrides?.config?.paymentsSetupStatus ?? 'ready',
      stripeConnectedAccountId:
        overrides?.config?.connectedAccount === undefined
          ? 'acct_1'
          : overrides.config.connectedAccount
    }),
    recordSession: async (input) => {
      recordSessionInput = input;
      return makeSession({
        id: input.id,
        shopId: input.shopId,
        idempotencyKey: input.request.idempotencyKey,
        checkoutUrl: input.checkoutUrl,
        amountCents: input.request.amountCents,
        currency: input.request.currency.toUpperCase(),
        applicationFeeCents: input.applicationFeeCents,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
      });
    },
    recordPaidEvent: async (input: unknown) => {
      recordPaidEventCalls.push(input);
      return (await overrides?.recordPaidEvent?.(input)) ?? 'recorded';
    },
    listCreatedPaymentSessionsForReconciliation: async () =>
      overrides?.createdSessionsForReconciliation ?? [],
    listUndeliveredPaymentEvents: async () => [],
    acknowledgePaymentEvent: async () => true,
    withRefundSessionLock: async <T>(_shopId: string, _sessionId: string, cb: () => Promise<T>) =>
      cb(),
    findRefundRequestByIdempotencyKey: async () => overrides?.existingRefundRequest ?? null,
    findPaidSessionForRefund: async () => overrides?.paidSession ?? null,
    sumConsumedRefundCentsForSession: async () => overrides?.consumedRefundCents ?? 0,
    createRefundRequest: async (input) => {
      createRefundRequestInput = input;
      return makeRefundRequest({
        id: input.id,
        shopId: input.shopId,
        paymentSessionId: input.paymentSessionId,
        idempotencyKey: input.idempotencyKey,
        amountCents: input.amountCents,
        currency: input.currency,
        reason: input.reason,
        stripeConnectedAccountId: input.stripeConnectedAccountId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        applicationFeeRefundedCents: input.applicationFeeRefundedCents,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
      });
    },
    setRefundRequestStripeRefundId: async (input) => {
      setRefundStripeIdInput = input;
    },
    recordRefundEvent: async (input) => {
      recordRefundEventCalls.push(input);
      return overrides?.recordRefundOutcome ?? 'recorded';
    },
    listUndeliveredRefundEvents: async () => [],
    acknowledgeRefundEvent: async () => true
  };

  const stripe = {
    isConfigured: true,
    createCheckoutSession: async (input: Record<string, unknown>) => {
      createCheckoutInput = input;
      return {
        stripeCheckoutSessionId: 'cs_1',
        stripePaymentIntentId: 'pi_1',
        checkoutUrl: 'https://stripe.test/checkout',
        expiresAt: new Date('2026-06-14T00:00:00.000Z')
      };
    },
    createRefund: async (input: Record<string, unknown>) => {
      createRefundInput = input;
      if (overrides?.createRefundThrows) {
        throw new Error('stripe refund failed');
      }
      return { stripeRefundId: 're_1', status: 'pending' as const };
    },
    constructWebhookEvent: (): StripeWebhookEvent => ({
      id: 'evt',
      type: 'noop',
      created: 0,
      data: { object: {} }
    }),
    retrieveCheckoutSession: async (input: Record<string, unknown>) => {
      retrieveCheckoutSessionCalls.push(input);
      if (overrides?.retrieveCheckoutSessionThrows) {
        throw new Error('stripe session read failed');
      }
      return (
        (await overrides?.retrieveCheckoutSession?.(input)) ?? {
          stripeCheckoutSessionId: String(input.stripeCheckoutSessionId),
          paymentStatus: 'open',
          stripePaymentIntentId: null,
          amountCents: null,
          currency: null,
          paidAt: null
        }
      );
    }
  };

  const paymentSetupService = {
    refreshSetupStatusForConnectedAccount: jest.fn()
  };

  const service = new RelayPaymentsService(
    store as never,
    stripe as never,
    paymentSetupService as never
  );
  return {
    service,
    stripe,
    paymentSetupService,
    getRecordPaidEventCalls: () => recordPaidEventCalls,
    getRecordRefundEventCalls: () => recordRefundEventCalls,
    getRecordSessionInput: () => recordSessionInput,
    getCreateCheckoutInput: () => createCheckoutInput,
    getCreateRefundRequestInput: () => createRefundRequestInput,
    getCreateRefundInput: () => createRefundInput,
    getSetRefundStripeIdInput: () => setRefundStripeIdInput,
    getRetrieveCheckoutSessionCalls: () => retrieveCheckoutSessionCalls
  };
}

function makeSession(overrides?: Partial<RelayPaymentSessionRecord>): RelayPaymentSessionRecord {
  const createdAt = new Date('2026-06-13T12:00:00.000Z');
  return {
    id: 'pay_sess_existing',
    shopId: 'shop_1',
    idempotencyKey: 'invoice-payment:job-1:84500',
    jobRef: 'job-1',
    invoiceRef: 'inv-1',
    amountCents: 84_500,
    currency: 'USD',
    description: 'BellField invoice 1001',
    customerEmail: null,
    successUrl: 'https://relay.example/payment-return/success',
    cancelUrl: 'https://relay.example/payment-return/canceled',
    stripeConnectedAccountId: 'acct_1',
    stripeCheckoutSessionId: 'cs_existing',
    stripePaymentIntentId: null,
    checkoutUrl: 'https://stripe.test/existing',
    status: 'created',
    applicationFeeCents: 845,
    expiresAt: new Date(Date.now() + 60_000),
    paidAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function makeRefundRequest(
  overrides?: Partial<RelayPaymentRefundRequestRecord>
): RelayPaymentRefundRequestRecord {
  const createdAt = new Date('2026-06-14T12:00:00.000Z');
  return {
    id: 'pay_refund_1',
    shopId: 'shop_1',
    paymentSessionId: 'pay_sess_existing',
    idempotencyKey: 'invoice-refund:pay-1:30000',
    amountCents: 30_000,
    currency: 'USD',
    reason: null,
    stripeConnectedAccountId: 'acct_1',
    stripePaymentIntentId: 'pi_1',
    stripeRefundId: null,
    applicationFeeRefundedCents: 300,
    status: 'requested',
    failureReason: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

const baseRequest = {
  idempotencyKey: 'invoice-payment:job-1:84500',
  jobRef: 'job-1',
  invoiceRef: 'inv-1',
  amountCents: 84_500,
  currency: 'USD',
  description: 'BellField invoice 1001'
};

const baseRefundRequest = {
  idempotencyKey: 'invoice-refund:pay-1:30000',
  providerSessionId: 'cs_paid',
  amountCents: 30_000,
  reason: 'overcharge'
};

function paidSession(overrides?: Partial<RelayPaymentSessionRecord>): RelayPaymentSessionRecord {
  return makeSession({
    id: 'pay_sess_paid',
    stripeCheckoutSessionId: 'cs_paid',
    stripePaymentIntentId: 'pi_1',
    status: 'paid',
    amountCents: 84_500,
    applicationFeeCents: 845,
    ...overrides
  });
}

describe('RelayPaymentsService.createPaymentSession', () => {
  beforeEach(() => {
    process.env.BELLFIELD_RELAY_PUBLIC_BASE_URL = 'https://relay.example';
    delete process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS;
  });

  it('mints success/cancel URLs from the relay public base, not from the install', async () => {
    const ctx = makeService();
    const result = await ctx.service.createPaymentSession(shop, baseRequest);

    expect(result.kind).toBe('created');
    expect(ctx.getCreateCheckoutInput()?.successUrl).toBe(
      'https://relay.example/payment-return/success'
    );
    expect(ctx.getCreateCheckoutInput()?.cancelUrl).toBe(
      'https://relay.example/payment-return/canceled'
    );
    expect(ctx.getRecordSessionInput()?.successUrl).toBe(
      'https://relay.example/payment-return/success'
    );
  });

  it('creates sessions with BellField fixed 1% platform fee', async () => {
    const ctx = makeService();
    const result = await ctx.service.createPaymentSession(shop, baseRequest);

    expect(result.kind).toBe('created');
    expect(ctx.getCreateCheckoutInput()?.applicationFeeCents).toBe(845);
    expect(ctx.getRecordSessionInput()?.applicationFeeCents).toBe(845);
  });

  it('caps tiny payment application fees below the full charge amount', async () => {
    const ctx = makeService();
    const result = await ctx.service.createPaymentSession(shop, { ...baseRequest, amountCents: 1 });

    expect(result.kind).toBe('created');
    expect(ctx.getCreateCheckoutInput()?.applicationFeeCents).toBe(0);
    expect(ctx.getRecordSessionInput()?.applicationFeeCents).toBe(0);
  });

  it('rejects a non-positive amount before touching Stripe', async () => {
    const ctx = makeService();
    const result = await ctx.service.createPaymentSession(shop, { ...baseRequest, amountCents: 0 });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('invalidAmount');
    }
    expect(ctx.getCreateCheckoutInput()).toBeUndefined();
  });

  it('blocks payment-session creation before online payments are ready', async () => {
    const ctx = makeService({
      config: {
        paymentsStatus: 'disabled',
        paymentsSetupStatus: 'notStarted',
        connectedAccount: 'acct_1'
      }
    });

    const result = await ctx.service.createPaymentSession(shop, baseRequest);

    expect(result).toEqual({
      kind: 'failed',
      code: 'paymentsDisabled',
      reason: 'notStarted',
      retryable: false,
      message: 'Online payments are not set up yet. An owner can set them up in Settings.'
    });
    expect(ctx.getCreateCheckoutInput()).toBeUndefined();
  });

  it('returns precise disabled reasons when account setup needs attention', async () => {
    const ctx = makeService({
      config: {
        paymentsStatus: 'disabled',
        paymentsSetupStatus: 'actionRequired',
        connectedAccount: 'acct_1'
      }
    });

    const result = await ctx.service.createPaymentSession(shop, baseRequest);

    expect(result).toEqual({
      kind: 'failed',
      code: 'paymentsDisabled',
      reason: 'actionRequired',
      retryable: false,
      message: 'Online payments need attention. An owner can continue setup in Settings.'
    });
  });

  it('reuses an existing session with the same idempotency key without touching Stripe', async () => {
    const existing = makeSession({
      id: 'pay_sess_reusable',
      checkoutUrl: 'https://stripe.test/reusable',
      expiresAt: new Date(Date.now() - 60_000)
    });
    const ctx = makeService({ existingSession: existing });

    const result = await ctx.service.createPaymentSession(shop, baseRequest);

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') {
      throw new Error('Expected an existing payment session.');
    }
    expect(result.paymentSessionId).toBe('pay_sess_reusable');
    expect(result.checkoutUrl).toBe('https://stripe.test/reusable');
    expect(ctx.getCreateCheckoutInput()).toBeUndefined();
    expect(ctx.getRecordSessionInput()).toBeUndefined();
  });
});

describe('RelayPaymentsService.handleStripeWebhook', () => {
  function paidEvent(amountTotal: number, account?: string): StripeWebhookEvent {
    return {
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: 1_700_000_000,
      account,
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_1',
          payment_status: 'paid',
          payment_intent: 'pi_1',
          amount_total: amountTotal,
          currency: 'usd'
        }
      }
    };
  }

  it('ignores a zero-amount paid session instead of recording it', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => paidEvent(0);
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });

  it('passes the connected account through for reconciliation', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => paidEvent(84_500, 'acct_x');
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    const calls = ctx.getRecordPaidEventCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { connectedAccountId?: string }).connectedAccountId).toBe('acct_x');
    expect((calls[0] as { amountCents?: number }).amountCents).toBe(84_500);
  });

  it('ignores non-completed event types', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => ({
      id: 'evt_2',
      type: 'payment_intent.created',
      created: 1,
      data: { object: { object: 'payment_intent' } }
    });
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });

  it('refreshes connected account status on account.updated', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => ({
      id: 'evt_account',
      type: 'account.updated',
      created: 1,
      account: 'acct_1',
      data: { object: { object: 'account', id: 'acct_1' } }
    });

    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');

    expect(ctx.paymentSetupService.refreshSetupStatusForConnectedAccount).toHaveBeenCalledWith(
      'acct_1'
    );
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });

  it('propagates account.updated setup refresh failures so Stripe can retry', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => ({
      id: 'evt_account',
      type: 'account.updated',
      created: 1,
      account: 'acct_1',
      data: { object: { object: 'account', id: 'acct_1' } }
    });
    ctx.paymentSetupService.refreshSetupStatusForConnectedAccount.mockRejectedValueOnce(
      new Error('stripe setup refresh failed')
    );

    await expect(ctx.service.handleStripeWebhook(Buffer.from(''), 'sig')).rejects.toThrow(
      'stripe setup refresh failed'
    );
  });

  it('ignores account.updated events without connected account context', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => ({
      id: 'evt_account',
      type: 'account.updated',
      created: 1,
      data: { object: { object: 'account', id: 'acct_1' } }
    });

    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');

    expect(ctx.paymentSetupService.refreshSetupStatusForConnectedAccount).not.toHaveBeenCalled();
  });
});

describe('RelayPaymentsService.listUndeliveredPaymentEvents', () => {
  it('poll-reconciles paid created Checkout sessions before listing events', async () => {
    const created = makeSession({
      id: 'pay_sess_poll',
      stripeConnectedAccountId: 'acct_poll',
      stripeCheckoutSessionId: 'cs_poll'
    });
    const ctx = makeService({
      createdSessionsForReconciliation: [created],
      retrieveCheckoutSession: async () => ({
        stripeCheckoutSessionId: 'cs_poll',
        paymentStatus: 'paid',
        stripePaymentIntentId: 'pi_poll',
        amountCents: 84_500,
        currency: 'usd',
        paidAt: new Date('2026-06-15T12:00:00.000Z')
      })
    });

    const result = await ctx.service.listUndeliveredPaymentEvents('shop_1');

    expect(result.events).toEqual([]);
    expect(ctx.getRetrieveCheckoutSessionCalls()).toEqual([
      { connectedAccountId: 'acct_poll', stripeCheckoutSessionId: 'cs_poll' }
    ]);
    expect(ctx.getRecordPaidEventCalls()).toEqual([
      {
        stripeEventId: 'stripe_poll:cs_poll',
        stripeCheckoutSessionId: 'cs_poll',
        stripePaymentIntentId: 'pi_poll',
        connectedAccountId: 'acct_poll',
        amountCents: 84_500,
        currency: 'USD',
        paidAt: new Date('2026-06-15T12:00:00.000Z'),
        occurredAt: expect.any(Date)
      }
    ]);
  });

  it('leaves unpaid polled sessions alone', async () => {
    const ctx = makeService({
      createdSessionsForReconciliation: [makeSession({ stripeCheckoutSessionId: 'cs_open' })],
      retrieveCheckoutSession: async () => ({
        stripeCheckoutSessionId: 'cs_open',
        paymentStatus: 'open',
        stripePaymentIntentId: null,
        amountCents: null,
        currency: null,
        paidAt: null
      })
    });

    await ctx.service.listUndeliveredPaymentEvents('shop_1');

    expect(ctx.getRetrieveCheckoutSessionCalls()).toHaveLength(1);
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });

  it('ignores a zero-amount paid polled session instead of recording it', async () => {
    const ctx = makeService({
      createdSessionsForReconciliation: [makeSession({ stripeCheckoutSessionId: 'cs_zero' })],
      retrieveCheckoutSession: async () => ({
        stripeCheckoutSessionId: 'cs_zero',
        paymentStatus: 'paid',
        stripePaymentIntentId: 'pi_zero',
        amountCents: 0,
        currency: 'usd',
        paidAt: new Date('2026-06-15T12:00:00.000Z')
      })
    });

    await ctx.service.listUndeliveredPaymentEvents('shop_1');

    expect(ctx.getRetrieveCheckoutSessionCalls()).toHaveLength(1);
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });

  it('does not block event polling when Stripe session reconciliation fails', async () => {
    const ctx = makeService({
      createdSessionsForReconciliation: [makeSession({ stripeCheckoutSessionId: 'cs_error' })],
      retrieveCheckoutSessionThrows: true
    });

    await expect(ctx.service.listUndeliveredPaymentEvents('shop_1')).resolves.toEqual({
      events: []
    });
    expect(ctx.getRecordPaidEventCalls()).toHaveLength(0);
  });
});

describe('RelayPaymentsService.createRefund', () => {
  beforeEach(() => {
    process.env.BELLFIELD_RELAY_PUBLIC_BASE_URL = 'https://relay.example';
  });

  it('refunds against the relay-owned session, not an install-supplied payment intent', async () => {
    const ctx = makeService({ paidSession: paidSession() });
    const result = await ctx.service.createRefund(shop, baseRefundRequest);

    expect(result.kind).toBe('requested');
    // The connected account + payment intent come from the relay's stored session.
    expect(ctx.getCreateRefundInput()?.connectedAccountId).toBe('acct_1');
    expect(ctx.getCreateRefundInput()?.paymentIntentId).toBe('pi_1');
    expect(ctx.getCreateRefundInput()?.amountCents).toBe(30_000);
    // Proportional application fee = 845 * 30000 / 84500 = 300.
    expect(ctx.getCreateRefundRequestInput()?.applicationFeeRefundedCents).toBe(300);
    expect(ctx.getSetRefundStripeIdInput()?.stripeRefundId).toBe('re_1');
  });

  it('rejects a refund that exceeds the remaining refundable (incl. pending/consumed)', async () => {
    // $845.00 paid, $700.00 already committed → only $145.00 remains; $300 is too much.
    const ctx = makeService({ paidSession: paidSession(), consumedRefundCents: 70_000 });
    const result = await ctx.service.createRefund(shop, baseRefundRequest);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('amountExceedsRefundable');
    }
    expect(ctx.getCreateRefundInput()).toBeUndefined();
  });

  it('rejects when no paid session matches the install reference', async () => {
    const ctx = makeService({ paidSession: null });
    const result = await ctx.service.createRefund(shop, baseRefundRequest);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('sessionNotFound');
    }
    expect(ctx.getCreateRefundInput()).toBeUndefined();
  });

  it('replays a fully-issued refund without calling Stripe again', async () => {
    const ctx = makeService({
      existingRefundRequest: makeRefundRequest({ stripeRefundId: 're_existing' })
    });
    const result = await ctx.service.createRefund(shop, baseRefundRequest);

    expect(result.kind).toBe('requested');
    if (result.kind === 'requested') {
      expect(result.providerRefundId).toBe('re_existing');
    }
    expect(ctx.getCreateRefundInput()).toBeUndefined();
  });

  it('reports a retryable providerError when Stripe refund creation throws', async () => {
    const ctx = makeService({ paidSession: paidSession(), createRefundThrows: true });
    const result = await ctx.service.createRefund(shop, baseRefundRequest);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('providerError');
      expect(result.retryable).toBe(true);
    }
  });
});

describe('RelayPaymentsService.handleStripeWebhook refunds', () => {
  function refundEvent(
    type: string,
    status: string,
    amount = 30_000,
    refundId = 're_1'
  ): StripeWebhookEvent {
    return {
      id: `evt_${refundId}_${status}`,
      type,
      created: 1_700_000_000,
      account: 'acct_1',
      data: {
        object: {
          object: 'refund',
          id: refundId,
          status,
          payment_intent: 'pi_1',
          amount,
          currency: 'usd',
          failure_reason: status === 'failed' ? 'card_declined' : null,
          metadata: { bellfieldRefundRequestId: 'pay_refund_1' }
        }
      }
    };
  }

  it('records a terminal succeeded refund event', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => refundEvent('refund.updated', 'succeeded');
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    const calls = ctx.getRecordRefundEventCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { status?: string }).status).toBe('succeeded');
    expect((calls[0] as { amountCents?: number }).amountCents).toBe(30_000);
  });

  it('ignores a non-terminal (pending) refund event', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => refundEvent('refund.created', 'pending');
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    expect(ctx.getRecordRefundEventCalls()).toHaveLength(0);
  });

  it('records a failed refund event so the install can clear the pending request', async () => {
    const ctx = makeService();
    ctx.stripe.constructWebhookEvent = () => refundEvent('refund.failed', 'failed');
    await ctx.service.handleStripeWebhook(Buffer.from(''), 'sig');
    const calls = ctx.getRecordRefundEventCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { status?: string }).status).toBe('failed');
  });
});
