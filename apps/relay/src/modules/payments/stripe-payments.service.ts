import { Injectable } from '@nestjs/common';
import Stripe = require('stripe');
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import type {
  StripeCheckoutSessionCreateInput,
  StripeCheckoutSessionCreateResult
} from './payments.types';

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

@Injectable()
export class StripePaymentsService {
  private readonly stripeSecretKey = getRelayRuntimeConfig().stripeSecretKey;
  private readonly stripeWebhookSecret = getRelayRuntimeConfig().stripeWebhookSecret;
  private readonly stripe = this.stripeSecretKey
    ? new Stripe(this.stripeSecretKey, { typescript: true })
    : null;

  get isConfigured(): boolean {
    return Boolean(this.stripe && this.stripeWebhookSecret);
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
