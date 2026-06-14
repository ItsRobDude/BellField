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
});
