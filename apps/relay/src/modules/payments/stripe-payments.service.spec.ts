import { StripePaymentsService } from './stripe-payments.service';

describe('StripePaymentsService', () => {
  const originalStripeSecretKey = process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY;
  const originalStripeWebhookSecret = process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalStripeSecretKey === undefined) {
      delete process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY;
    } else {
      process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY = originalStripeSecretKey;
    }

    if (originalStripeWebhookSecret === undefined) {
      delete process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET = originalStripeWebhookSecret;
    }
  });

  it('constructs the Stripe client when relay payments are configured', () => {
    process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY = 'sk_test_configured_for_constructor';
    process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET = 'whsec_configured_for_constructor';

    const service = new StripePaymentsService();

    expect(service.isConfigured).toBe(true);
  });

  it('creates an Express connected account for BellField online payments', async () => {
    process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY = 'sk_test_configured_for_constructor';
    process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET = 'whsec_configured_for_constructor';
    const service = new StripePaymentsService();
    const create = jest.fn().mockResolvedValue({ id: 'acct_1' });
    setStripeClient(service, { accounts: { create } });

    const result = await service.createConnectedAccount({
      shopId: 'shop_1',
      displayName: 'Acme HVAC'
    });

    expect(result.connectedAccountId).toBe('acct_1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        metadata: { bellfieldShopId: 'shop_1' }
      }),
      { idempotencyKey: 'bellfield-connected-account:shop_1' }
    );
  });

  it('retrieves connected account readiness', async () => {
    process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY = 'sk_test_configured_for_constructor';
    process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET = 'whsec_configured_for_constructor';
    const service = new StripePaymentsService();
    const retrieve = jest.fn().mockResolvedValue({
      id: 'acct_1',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      capabilities: { card_payments: 'active', transfers: 'active' },
      requirements: { currently_due: [], past_due: [], disabled_reason: null }
    });
    setStripeClient(service, { accounts: { retrieve } });

    await expect(service.retrieveConnectedAccount('acct_1')).resolves.toEqual({
      connectedAccountId: 'acct_1',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      cardPaymentsCapability: 'active',
      transfersCapability: 'active',
      currentlyDue: [],
      pastDue: [],
      disabledReason: null
    });
  });

  it('creates hosted onboarding links', async () => {
    process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY = 'sk_test_configured_for_constructor';
    process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET = 'whsec_configured_for_constructor';
    const service = new StripePaymentsService();
    const create = jest.fn().mockResolvedValue({
      url: 'https://connect.stripe.test/setup',
      expires_at: 1_782_000_000
    });
    setStripeClient(service, { accountLinks: { create } });

    const result = await service.createAccountOnboardingLink({
      connectedAccountId: 'acct_1',
      refreshUrl: 'https://relay.example/payments/setup/refresh',
      returnUrl: 'https://relay.example/payments/setup/return'
    });

    expect(result.onboardingUrl).toBe('https://connect.stripe.test/setup');
    expect(create).toHaveBeenCalledWith({
      account: 'acct_1',
      refresh_url: 'https://relay.example/payments/setup/refresh',
      return_url: 'https://relay.example/payments/setup/return',
      type: 'account_onboarding'
    });
  });
});

function setStripeClient(service: StripePaymentsService, stripe: unknown) {
  (service as unknown as { stripe: unknown }).stripe = stripe;
}
