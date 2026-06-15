import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  RelayCreatePaymentSessionRequest,
  RelayCreateRefundRequest,
  RelayPaymentEventAckResponse,
  RelayPaymentEventsResponse,
  RelayPaymentSessionResult,
  RelayRefundEventAckResponse,
  RelayRefundEventsResponse,
  RelayRefundResult
} from '@bellfield/contracts';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { log } from '../../common/logger';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import {
  isStripeCheckoutSession,
  isStripeRefund,
  StripePaymentsService,
  type StripeWebhookEvent
} from './stripe-payments.service';
import type { RelayPaymentRefundRequestRecord, RelayPaymentsStore } from './payments.types';

export const RELAY_PAYMENTS_STORE = 'RELAY_PAYMENTS_STORE';

@Injectable()
export class RelayPaymentsService {
  private readonly runtimeConfig = getRelayRuntimeConfig();
  private readonly platformFeeBasisPoints = this.runtimeConfig.paymentsPlatformFeeBasisPoints;

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
        // The relay owns the customer-facing origin; the install never supplies
        // the post-checkout redirect target.
        const successUrl = `${this.runtimeConfig.publicBaseUrl}/payment-return/success`;
        const cancelUrl = `${this.runtimeConfig.publicBaseUrl}/payment-return/canceled`;

        try {
          const stripeSession = await this.stripePaymentsService.createCheckoutSession({
            ...request,
            currency: request.currency.toUpperCase(),
            connectedAccountId: paymentsConfig.stripeConnectedAccountId,
            applicationFeeCents,
            successUrl,
            cancelUrl
          });
          const recorded = await this.paymentsStore.recordSession({
            id: `pay_sess_${cryptoRandomSuffix()}`,
            shopId: shop.shopId,
            request,
            successUrl,
            cancelUrl,
            stripeConnectedAccountId: paymentsConfig.stripeConnectedAccountId,
            stripeCheckoutSessionId: stripeSession.stripeCheckoutSessionId,
            stripePaymentIntentId: stripeSession.stripePaymentIntentId,
            checkoutUrl: stripeSession.checkoutUrl,
            applicationFeeCents,
            expiresAt: stripeSession.expiresAt,
            createdAt: new Date()
          });
          return sessionResult(recorded);
        } catch (error) {
          // A permanent failure (restricted connected account, unsupported
          // currency) is reported retryable so the office can retry transient
          // outages, but it must be logged or the real cause is invisible.
          log('error', 'Stripe checkout session creation failed.', {
            shopId: shop.shopId,
            error
          });
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
    if (
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'refund.failed'
    ) {
      await this.handleRefundWebhook(event);
      return;
    }
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    const session = event.data.object;
    if (!isStripeCheckoutSession(session) || session.payment_status !== 'paid') {
      return;
    }
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);
    // amount_total === 0 is a number and would pass a typeof check, but the
    // ledger requires a positive amount; treat a zero/blank paid session as a
    // no-op rather than letting the DB CHECK throw and 500 the webhook.
    if (
      !paymentIntentId ||
      typeof session.amount_total !== 'number' ||
      session.amount_total <= 0 ||
      !session.currency
    ) {
      return;
    }
    const outcome = await this.paymentsStore.recordPaidEvent({
      stripeEventId: event.id,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      connectedAccountId: event.account,
      amountCents: session.amount_total,
      currency: session.currency.toUpperCase(),
      paidAt: new Date(event.created * 1000),
      occurredAt: new Date()
    });
    // A mismatch or missing session is a reconciliation failure, not a crash:
    // the event is acknowledged (200) but never trusted into the ledger.
    if (outcome === 'mismatch' || outcome === 'sessionNotFound') {
      log('error', 'Paid webhook did not reconcile against a stored session.', {
        outcome,
        stripeCheckoutSessionId: session.id,
        stripeEventId: event.id
      });
    }
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

  /**
   * Request a refund against a paid session the shop owns. Serialized per session
   * so concurrent/double-clicked requests can't both pass the remaining-refundable
   * check. The install never supplies a PaymentIntent or amount the relay forwards
   * blind: the relay reads them from its own stored session.
   */
  async createRefund(
    shop: AuthenticatedRelayShop,
    request: RelayCreateRefundRequest
  ): Promise<RelayRefundResult> {
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
        code: 'notRefundable',
        retryable: false,
        message: 'Refund amount must be positive.'
      };
    }

    return this.paymentsStore.withRefundSessionLock(
      shop.shopId,
      request.providerSessionId,
      async () => {
        const existing = await this.paymentsStore.findRefundRequestByIdempotencyKey(
          shop.shopId,
          request.idempotencyKey
        );
        if (existing) {
          // Replay: a fully-issued refund returns as-is; one whose Stripe call
          // failed mid-flight retries Stripe under the same idempotency key
          // (Stripe dedupes), so it can never double-refund.
          return existing.stripeRefundId
            ? requestedResult(existing)
            : this.attemptStripeRefund(existing);
        }

        const session = await this.paymentsStore.findPaidSessionForRefund(
          shop.shopId,
          request.providerSessionId
        );
        if (!session) {
          return {
            kind: 'failed',
            code: 'sessionNotFound',
            retryable: false,
            message: 'No paid payment was found for this session.'
          };
        }
        if (!session.stripePaymentIntentId) {
          return {
            kind: 'failed',
            code: 'notRefundable',
            retryable: false,
            message: 'This payment cannot be refunded yet.'
          };
        }

        const consumedCents = await this.paymentsStore.sumConsumedRefundCentsForSession(session.id);
        const remainingCents = session.amountCents - consumedCents;
        if (request.amountCents > remainingCents) {
          return {
            kind: 'failed',
            code: 'amountExceedsRefundable',
            retryable: false,
            message: 'Refund exceeds the amount still refundable on this payment.'
          };
        }

        const created = await this.paymentsStore.createRefundRequest({
          id: `pay_refund_${cryptoRandomSuffix()}`,
          shopId: shop.shopId,
          paymentSessionId: session.id,
          idempotencyKey: request.idempotencyKey,
          amountCents: request.amountCents,
          currency: session.currency,
          reason: request.reason ?? null,
          stripeConnectedAccountId: session.stripeConnectedAccountId,
          stripePaymentIntentId: session.stripePaymentIntentId,
          applicationFeeRefundedCents: proportionalFeeCents(
            session.applicationFeeCents,
            request.amountCents,
            session.amountCents
          ),
          createdAt: new Date()
        });
        return this.attemptStripeRefund(created);
      }
    );
  }

  private async attemptStripeRefund(
    request: RelayPaymentRefundRequestRecord
  ): Promise<RelayRefundResult> {
    try {
      const refund = await this.stripePaymentsService.createRefund({
        connectedAccountId: request.stripeConnectedAccountId,
        paymentIntentId: request.stripePaymentIntentId,
        amountCents: request.amountCents,
        refundRequestId: request.id,
        idempotencyKey: request.idempotencyKey
      });
      await this.paymentsStore.setRefundRequestStripeRefundId({
        id: request.id,
        stripeRefundId: refund.stripeRefundId,
        updatedAt: new Date()
      });
      return {
        kind: 'requested',
        refundRequestId: request.id,
        providerRefundId: refund.stripeRefundId,
        amountCents: request.amountCents,
        currency: request.currency,
        providerStatus: refund.status
      };
    } catch (error) {
      log('error', 'Stripe refund creation failed.', { shopId: request.shopId, error });
      return {
        kind: 'failed',
        code: 'providerError',
        retryable: true,
        message: 'Stripe could not create the refund.'
      };
    }
  }

  private async handleRefundWebhook(event: StripeWebhookEvent): Promise<void> {
    const refund = event.data.object;
    if (!isStripeRefund(refund)) {
      return;
    }
    // Only terminal refunds change ledger state; pending/requires_action wait for
    // a later refund.updated/failed.
    const terminal: 'succeeded' | 'failed' | null =
      refund.status === 'succeeded'
        ? 'succeeded'
        : refund.status === 'failed' || refund.status === 'canceled'
          ? 'failed'
          : null;
    if (!terminal) {
      return;
    }
    const amountCents = typeof refund.amount === 'number' ? refund.amount : 0;
    if (amountCents <= 0 || !refund.currency) {
      return;
    }
    const outcome = await this.paymentsStore.recordRefundEvent({
      stripeEventId: event.id,
      stripeRefundId: refund.id,
      connectedAccountId: event.account,
      status: terminal,
      amountCents,
      currency: refund.currency.toUpperCase(),
      failureReason: refund.failure_reason ?? null,
      occurredAt: new Date(event.created * 1000)
    });
    if (outcome === 'requestNotFound') {
      // An out-of-band refund (created in the Stripe dashboard, not via BellField).
      // Deferred reconciliation, not a crash — acknowledge (200) and log.
      log('error', 'Refund webhook had no matching BellField refund request.', {
        stripeRefundId: refund.id,
        stripeEventId: event.id
      });
    }
  }

  async listUndeliveredRefundEvents(shopId: string): Promise<RelayRefundEventsResponse> {
    const events = await this.paymentsStore.listUndeliveredRefundEvents(shopId);
    return { events };
  }

  async acknowledgeRefundEvent(
    shopId: string,
    refundEventId: string,
    deliveredAt: Date
  ): Promise<RelayRefundEventAckResponse> {
    const acknowledged = await this.paymentsStore.acknowledgeRefundEvent(
      shopId,
      refundEventId,
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

function requestedResult(request: RelayPaymentRefundRequestRecord): RelayRefundResult {
  return {
    kind: 'requested',
    refundRequestId: request.id,
    providerRefundId: request.stripeRefundId ?? '',
    amountCents: request.amountCents,
    currency: request.currency,
    providerStatus: request.status === 'succeeded' ? 'succeeded' : 'pending'
  };
}

/** Proportional application fee for a (partial) refund, mirroring Stripe's own
 * proportional `refund_application_fee` math so the local ledger agrees. */
function proportionalFeeCents(
  applicationFeeCents: number,
  refundAmountCents: number,
  sessionAmountCents: number
): number {
  if (sessionAmountCents <= 0) {
    return 0;
  }
  return Math.round((applicationFeeCents * refundAmountCents) / sessionAmountCents);
}

function cryptoRandomSuffix(): string {
  return randomBytes(10).toString('hex');
}
