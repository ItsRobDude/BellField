import { RelayPaymentsService } from './payments.service';
import type { StripeWebhookEvent } from './stripe-payments.service';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';

const shop: AuthenticatedRelayShop = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  monthlySendQuota: 1000,
  tokenId: 'token_1',
  instanceId: 'instance-a'
};

function makeService(overrides?: {
  recordPaidEvent?: (input: unknown) => Promise<string>;
  config?: { paymentsStatus?: 'enabled' | 'disabled'; connectedAccount?: string | null };
}) {
  const recordPaidEventCalls: unknown[] = [];
  let recordSessionInput: Record<string, unknown> | undefined;
  let createCheckoutInput: Record<string, unknown> | undefined;

  const store = {
    withPaymentSessionLock: (_shopId: string, _key: string, cb: () => Promise<unknown>) => cb(),
    findSessionByIdempotencyKey: async () => null,
    findShopPaymentsConfig: async () => ({
      shopId: 'shop_1',
      paymentsStatus: overrides?.config?.paymentsStatus ?? 'enabled',
      stripeConnectedAccountId:
        overrides?.config?.connectedAccount === undefined
          ? 'acct_1'
          : overrides.config.connectedAccount
    }),
    recordSession: async (input: Record<string, unknown>) => {
      recordSessionInput = input;
      return {
        id: 'pay_sess_1',
        checkoutUrl: 'https://stripe.test/checkout',
        expiresAt: new Date('2026-06-14T00:00:00.000Z'),
        amountCents: input.request ? (input.request as { amountCents: number }).amountCents : 0,
        currency: 'USD',
        applicationFeeCents: input.applicationFeeCents
      };
    },
    recordPaidEvent: async (input: unknown) => {
      recordPaidEventCalls.push(input);
      return (await overrides?.recordPaidEvent?.(input)) ?? 'recorded';
    },
    listUndeliveredPaymentEvents: async () => [],
    acknowledgePaymentEvent: async () => true
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
    constructWebhookEvent: (): StripeWebhookEvent => ({
      id: 'evt',
      type: 'noop',
      created: 0,
      data: { object: {} }
    })
  };

  const service = new RelayPaymentsService(store as never, stripe as never);
  return {
    service,
    stripe,
    getRecordPaidEventCalls: () => recordPaidEventCalls,
    getRecordSessionInput: () => recordSessionInput,
    getCreateCheckoutInput: () => createCheckoutInput
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

describe('RelayPaymentsService.createPaymentSession', () => {
  beforeEach(() => {
    process.env.BELLFIELD_RELAY_PUBLIC_BASE_URL = 'https://relay.example';
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

  it('rejects a non-positive amount before touching Stripe', async () => {
    const ctx = makeService();
    const result = await ctx.service.createPaymentSession(shop, { ...baseRequest, amountCents: 0 });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('invalidAmount');
    }
    expect(ctx.getCreateCheckoutInput()).toBeUndefined();
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
});
