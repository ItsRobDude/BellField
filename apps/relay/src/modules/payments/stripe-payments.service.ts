import { Injectable } from '@nestjs/common';
import Stripe = require('stripe');
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import type {
  StripeCheckoutSessionCreateInput,
  StripeCheckoutSessionCreateResult,
  StripeRefundCreateInput,
  StripeRefundCreateResult
} from './payments.types';
import type {
  StripeAccountOnboardingLinkResult,
  StripeConnectedAccountCreateResult,
  StripeConnectedAccountReadiness
} from './payment-setup.types';

// Pin the API version so refund/checkout response shapes (and the version Stripe
// uses for our outbound calls) can't drift under us on an SDK bump. The webhook
// endpoint's delivered-event version is configured separately in the Stripe
// dashboard (see docs/refunds-design.md) and must track this.
const STRIPE_API_VERSION = '2026-05-27.dahlia';
const CONNECTED_ACCOUNT_IDEMPOTENCY_VERSION = 'stripe-responsible-v1';

type CheckoutPaymentIntentData = {
  metadata: Record<string, string>;
  application_fee_amount?: number;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  created: number;
  /** Connected account that produced the event; reconciled against the session. */
  account?: string;
  data: { object: unknown };
};

type StripeCheckoutSessionEventObject = {
  object: 'checkout.session';
  id: string;
  payment_status?: string | null;
  payment_intent?: string | { id?: string } | null;
  amount_total?: number | null;
  currency?: string | null;
};

type StripeRefundEventObject = {
  object: 'refund';
  id: string;
  status?: string | null;
  payment_intent?: string | { id?: string } | null;
  amount?: number | null;
  currency?: string | null;
  failure_reason?: string | null;
  metadata?: Record<string, string> | null;
};

@Injectable()
export class StripePaymentsService {
  private readonly stripeSecretKey = getRelayRuntimeConfig().stripeSecretKey;
  private readonly stripeWebhookSecret = getRelayRuntimeConfig().stripeWebhookSecret;
  private readonly stripe = this.stripeSecretKey
    ? new Stripe(this.stripeSecretKey, { apiVersion: STRIPE_API_VERSION, typescript: true })
    : null;

  get isConfigured(): boolean {
    return Boolean(this.stripe && this.stripeWebhookSecret);
  }

  async createConnectedAccount(input: {
    shopId: string;
    displayName: string;
  }): Promise<StripeConnectedAccountCreateResult> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }
    const account = await this.stripe.accounts.create(
      {
        country: 'US',
        controller: {
          losses: { payments: 'stripe' },
          fees: { payer: 'account' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' }
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_profile: {
          name: input.displayName,
          product_description: 'Home service payments through BellField'
        },
        metadata: {
          bellfieldShopId: input.shopId
        }
      },
      {
        idempotencyKey: `bellfield-connected-account:${CONNECTED_ACCOUNT_IDEMPOTENCY_VERSION}:${input.shopId}`
      }
    );
    return { connectedAccountId: account.id };
  }

  async retrieveConnectedAccount(
    connectedAccountId: string
  ): Promise<StripeConnectedAccountReadiness> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }
    const account = await this.stripe.accounts.retrieve(connectedAccountId);
    return {
      connectedAccountId: account.id,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      cardPaymentsCapability: account.capabilities?.card_payments ?? null,
      transfersCapability: account.capabilities?.transfers ?? null,
      currentlyDue: [...(account.requirements?.currently_due ?? [])],
      pastDue: [...(account.requirements?.past_due ?? [])],
      disabledReason: account.requirements?.disabled_reason ?? null
    };
  }

  async createAccountOnboardingLink(input: {
    connectedAccountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<StripeAccountOnboardingLinkResult> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }
    const accountLink = await this.stripe.accountLinks.create({
      account: input.connectedAccountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding'
    });
    return {
      onboardingUrl: accountLink.url,
      expiresAt: new Date(accountLink.expires_at * 1000)
    };
  }

  async createCheckoutSession(
    input: StripeCheckoutSessionCreateInput
  ): Promise<StripeCheckoutSessionCreateResult> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }
    const paymentIntentData: CheckoutPaymentIntentData = {
      metadata: {
        bellfieldJobRef: input.jobRef,
        bellfieldInvoiceRef: input.invoiceRef ?? ''
      }
    };
    if (input.applicationFeeCents > 0) {
      paymentIntentData.application_fee_amount = input.applicationFeeCents;
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Card-only for this first slice: the install ledger records only
        // immediately-confirmed payments. Delayed methods (ACH, etc.) fire
        // async_payment_succeeded, which is not handled yet — enabling them
        // here would silently drop genuinely-paid sessions.
        payment_method_types: ['card'],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer_email: input.customerEmail,
        metadata: {
          bellfieldJobRef: input.jobRef,
          bellfieldInvoiceRef: input.invoiceRef ?? ''
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: {
                name: input.description
              }
            }
          }
        ],
        payment_intent_data: paymentIntentData,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60
      },
      {
        stripeAccount: input.connectedAccountId,
        idempotencyKey: `bellfield-payment-session:${input.idempotencyKey}`
      }
    );

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL.');
    }

    return {
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      checkoutUrl: session.url,
      expiresAt: new Date((session.expires_at ?? Math.floor(Date.now() / 1000)) * 1000)
    };
  }

  /**
   * Refund a PaymentIntent on the connected account. `refund_application_fee:
   * true` returns BellField's platform fee proportionally for partial refunds.
   * The idempotency key is per refund request, so a retried request never
   * doubles the refund. Confirmation still arrives via the refund webhook.
   */
  async createRefund(input: StripeRefundCreateInput): Promise<StripeRefundCreateResult> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        refund_application_fee: true,
        metadata: {
          bellfieldRefundRequestId: input.refundRequestId
        }
      },
      {
        stripeAccount: input.connectedAccountId,
        idempotencyKey: `bellfield-payment-refund:${input.idempotencyKey}`
      }
    );
    return {
      stripeRefundId: refund.id,
      // Treat anything not yet 'succeeded' as pending; failed/canceled surface via
      // the refund webhook and clear the install's pending request.
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending'
    };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): StripeWebhookEvent {
    if (!this.stripe || !this.stripeWebhookSecret) {
      throw new Error('Stripe webhook handling is not configured.');
    }
    if (!signature) {
      throw new Error('Stripe signature header is missing.');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.stripeWebhookSecret
    ) as StripeWebhookEvent;
  }
}

export function isStripeCheckoutSession(value: unknown): value is StripeCheckoutSessionEventObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'object' in value &&
    (value as { object?: unknown }).object === 'checkout.session'
  );
}

export function isStripeRefund(value: unknown): value is StripeRefundEventObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'object' in value &&
    (value as { object?: unknown }).object === 'refund'
  );
}
