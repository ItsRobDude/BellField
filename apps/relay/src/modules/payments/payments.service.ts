import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  RelayCreatePaymentSessionRequest,
  RelayPaymentEventAckResponse,
  RelayPaymentEventsResponse,
  RelayPaymentSessionResult
} from '@bellfield/contracts';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import { isStripeCheckoutSession, StripePaymentsService } from './stripe-payments.service';
import type { RelayPaymentsStore } from './payments.types';

export const RELAY_PAYMENTS_STORE = 'RELAY_PAYMENTS_STORE';

@Injectable()
export class RelayPaymentsService {
  private readonly platformFeeBasisPoints = getRelayRuntimeConfig().paymentsPlatformFeeBasisPoints;

  constructor(
    @Inject(RELAY_PAYMENTS_STORE) private readonly paymentsStore: RelayPaymentsStore,
    private readonly stripePaymentsService: StripePaymentsService
  ) {}

  async createPaymentSession(
    shop: AuthenticatedRelayShop,
    request: RelayCreatePaymentSessionRequest
  ): Promise<RelayPaymentSessionResult> {
    if (!this.stripePaymentsService.isConfigured) {
      return {
        kind: 'failed',
        code: 'paymentsNotConfigured',
        retryable: false,
        message: 'BellField Payments is not configured.'
      };
    }
    if (request.amountCents <= 0 || !Number.isInteger(request.amountCents)) {
      return {
        kind: 'failed',
        code: 'invalidAmount',
        retryable: false,
        message: 'Payment amount must be positive.'
      };
    }

    return this.paymentsStore.withPaymentSessionLock(
      shop.shopId,
      request.idempotencyKey,
      async () => {
        const existing = await this.paymentsStore.findSessionByIdempotencyKey(
          shop.shopId,
          request.idempotencyKey
        );
        if (existing) {
          return sessionResult(existing);
        }

        const paymentsConfig = await this.paymentsStore.findShopPaymentsConfig(shop.shopId);
        if (
          !paymentsConfig ||
          paymentsConfig.paymentsStatus !== 'enabled' ||
          !paymentsConfig.stripeConnectedAccountId
        ) {
          return {
            kind: 'failed',
            code: 'paymentsDisabled',
            retryable: false,
            message: 'BellField Payments is not enabled for this shop.'
          };
        }

        const applicationFeeCents = calculateApplicationFeeCents(
          request.amountCents,
          this.platformFeeBasisPoints
        );

        try {
          const stripeSession = await this.stripePaymentsService.createCheckoutSession({
            ...request,
            currency: request.currency.toUpperCase(),
            connectedAccountId: paymentsConfig.stripeConnectedAccountId,
            applicationFeeCents
          });
          const recorded = await this.paymentsStore.recordSession({
            id: `pay_sess_${cryptoRandomSuffix()}`,
            shopId: shop.shopId,
            request,
            stripeConnectedAccountId: paymentsConfig.stripeConnectedAccountId,
            stripeCheckoutSessionId: stripeSession.stripeCheckoutSessionId,
            stripePaymentIntentId: stripeSession.stripePaymentIntentId,
            checkoutUrl: stripeSession.checkoutUrl,
            applicationFeeCents,
            expiresAt: stripeSession.expiresAt,
            createdAt: new Date()
          });
          return sessionResult(recorded);
        } catch {
          return {
            kind: 'failed',
            code: 'providerError',
            retryable: true,
            message: 'Stripe could not create the checkout session.'
          };
        }
      }
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const event = this.stripePaymentsService.constructWebhookEvent(rawBody, signature);
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    const session = event.data.object;
    if (!isStripeCheckoutSession(session) || session.payment_status !== 'paid') {
      return;
    }
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : undefined;
    if (!paymentIntentId || typeof session.amount_total !== 'number' || !session.currency) {
      return;
    }
    await this.paymentsStore.recordPaidEvent({
      stripeEventId: event.id,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      amountCents: session.amount_total,
      currency: session.currency.toUpperCase(),
      paidAt: new Date(event.created * 1000),
      occurredAt: new Date()
    });
  }

  async listUndeliveredPaymentEvents(shopId: string): Promise<RelayPaymentEventsResponse> {
    const events = await this.paymentsStore.listUndeliveredPaymentEvents(shopId);
    return { events };
  }

  async acknowledgePaymentEvent(
    shopId: string,
    paymentEventId: string,
    deliveredAt: Date
  ): Promise<RelayPaymentEventAckResponse> {
    const acknowledged = await this.paymentsStore.acknowledgePaymentEvent(
      shopId,
      paymentEventId,
      deliveredAt
    );
    return { acknowledged };
  }
}

function calculateApplicationFeeCents(amountCents: number, basisPoints: number): number {
  const fee = Math.round((amountCents * basisPoints) / 10_000);
  return Math.max(0, Math.min(fee, amountCents - 1));
}

function sessionResult(session: {
  id: string;
  checkoutUrl: string;
  expiresAt: Date;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
}): RelayPaymentSessionResult {
  return {
    kind: 'created',
    paymentSessionId: session.id,
    checkoutUrl: session.checkoutUrl,
    expiresAt: session.expiresAt.toISOString(),
    amountCents: session.amountCents,
    currency: session.currency,
    applicationFeeCents: session.applicationFeeCents
  };
}

function cryptoRandomSuffix(): string {
  return randomBytes(10).toString('hex');
}
