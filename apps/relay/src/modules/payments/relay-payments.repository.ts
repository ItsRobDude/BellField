import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import type {
  RecordPaidEventOutcome,
  RecordRefundEventOutcome,
  RelayPaymentRefundRequestRecord,
  RelayPaymentSessionRecord,
  RelayPaymentsStore,
  RelayShopPaymentsConfig
} from './payments.types';
import type { RelayPaymentEventRecord, RelayRefundEventRecord } from '@bellfield/contracts';

type PaymentSessionRow = {
  id: string;
  shop_id: string;
  idempotency_key: string;
  job_ref: string;
  invoice_ref: string | null;
  amount_cents: number;
  currency: string;
  description: string;
  customer_email: string | null;
  success_url: string;
  cancel_url: string;
  stripe_connected_account_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  checkout_url: string;
  status: RelayPaymentSessionRecord['status'];
  application_fee_cents: number;
  expires_at: Date;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type PaymentEventRow = {
  id: string;
  payment_session_id: string;
  job_ref: string;
  invoice_ref: string | null;
  provider_payment_id: string;
  provider_session_id: string;
  amount_cents: number;
  currency: string;
  application_fee_cents: number;
  processor_fee_cents: number | null;
  paid_at: Date;
};

const PAYMENT_SESSION_COLUMNS = `id, shop_id, idempotency_key, job_ref, invoice_ref,
  amount_cents, currency, description, customer_email, success_url, cancel_url,
  stripe_connected_account_id, stripe_checkout_session_id, stripe_payment_intent_id,
  checkout_url, status, application_fee_cents, expires_at, paid_at, created_at, updated_at`;

type RefundRequestRow = {
  id: string;
  shop_id: string;
  payment_session_id: string;
  idempotency_key: string;
  amount_cents: number;
  currency: string;
  reason: string | null;
  stripe_connected_account_id: string;
  stripe_payment_intent_id: string;
  stripe_refund_id: string | null;
  application_fee_refunded_cents: number | null;
  status: RelayPaymentRefundRequestRecord['status'];
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

type RefundEventRow = {
  id: string;
  refund_request_id: string;
  stripe_refund_id: string;
  provider_payment_id: string;
  provider_session_id: string;
  job_ref: string;
  amount_cents: number;
  currency: string;
  application_fee_refunded_cents: number | null;
  status: 'succeeded' | 'failed';
  failure_reason: string | null;
  occurred_at: Date;
};

const REFUND_REQUEST_COLUMNS = `id, shop_id, payment_session_id, idempotency_key, amount_cents,
  currency, reason, stripe_connected_account_id, stripe_payment_intent_id, stripe_refund_id,
  application_fee_refunded_cents, status, failure_reason, created_at, updated_at`;

@Injectable()
export class RelayPaymentsRepository implements RelayPaymentsStore {
  constructor(private readonly database: DatabaseService) {}

  async withPaymentSessionLock<T>(
    shopId: string,
    idempotencyKey: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (queryable) => {
      await queryable.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
        `relay-payment:${shopId}:${idempotencyKey}`
      ]);
      return callback();
    });
  }

  async findShopPaymentsConfig(shopId: string): Promise<RelayShopPaymentsConfig | null> {
    const result = await this.database.query<{
      shop_id: string;
      payments_status: 'disabled' | 'enabled';
      stripe_connected_account_id: string | null;
    }>(
      `select id as shop_id, payments_status, stripe_connected_account_id
       from relay_shops
       where id = $1`,
      [shopId]
    );
    const row = result.rows[0];
    return row
      ? {
          shopId: row.shop_id,
          paymentsStatus: row.payments_status,
          stripeConnectedAccountId: row.stripe_connected_account_id
        }
      : null;
  }

  async findSessionByIdempotencyKey(
    shopId: string,
    idempotencyKey: string
  ): Promise<RelayPaymentSessionRecord | null> {
    const result = await this.database.query<PaymentSessionRow>(
      `select ${PAYMENT_SESSION_COLUMNS}
       from relay_payment_sessions
       where shop_id = $1 and idempotency_key = $2`,
      [shopId, idempotencyKey]
    );
    return result.rows[0] ? toSessionRecord(result.rows[0]) : null;
  }

  async recordSession(input: Parameters<RelayPaymentsStore['recordSession']>[0]) {
    const inserted = await this.database.query<PaymentSessionRow>(
      `insert into relay_payment_sessions (
         id, shop_id, idempotency_key, job_ref, invoice_ref, amount_cents,
         currency, description, customer_email, success_url, cancel_url,
         stripe_connected_account_id, stripe_checkout_session_id,
         stripe_payment_intent_id, checkout_url, status, application_fee_cents,
         expires_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, 'created', $16, $17, $18, $18)
       on conflict (shop_id, idempotency_key) do nothing
       returning ${PAYMENT_SESSION_COLUMNS}`,
      [
        input.id,
        input.shopId,
        input.request.idempotencyKey,
        input.request.jobRef,
        input.request.invoiceRef ?? null,
        input.request.amountCents,
        input.request.currency.toUpperCase(),
        input.request.description,
        input.request.customerEmail ?? null,
        input.successUrl,
        input.cancelUrl,
        input.stripeConnectedAccountId,
        input.stripeCheckoutSessionId,
        input.stripePaymentIntentId,
        input.checkoutUrl,
        input.applicationFeeCents,
        input.expiresAt,
        input.createdAt
      ]
    );
    if (inserted.rows[0]) {
      return toSessionRecord(inserted.rows[0]);
    }
    const existing = await this.findSessionByIdempotencyKey(
      input.shopId,
      input.request.idempotencyKey
    );
    if (!existing) {
      throw new Error('Payment session insert conflicted but no session was found.');
    }
    return existing;
  }

  async recordPaidEvent(
    input: Parameters<RelayPaymentsStore['recordPaidEvent']>[0]
  ): Promise<RecordPaidEventOutcome> {
    return this.database.transaction(async (queryable) => {
      const sessionResult = await queryable.query<PaymentSessionRow>(
        `select ${PAYMENT_SESSION_COLUMNS}
         from relay_payment_sessions
         where stripe_checkout_session_id = $1
         for update`,
        [input.stripeCheckoutSessionId]
      );
      const session = sessionResult.rows[0];
      if (!session) {
        return 'sessionNotFound';
      }

      // Reconcile the webhook against the amount/currency/account we authorized
      // at session creation. The stored session is the contract; never trust a
      // webhook that reports a different amount, currency, or connected account.
      if (
        input.amountCents !== session.amount_cents ||
        input.currency.toUpperCase() !== session.currency.toUpperCase() ||
        (input.connectedAccountId !== undefined &&
          input.connectedAccountId !== session.stripe_connected_account_id)
      ) {
        return 'mismatch';
      }

      await queryable.query(
        `update relay_payment_sessions
         set status = 'paid',
             stripe_payment_intent_id = coalesce(stripe_payment_intent_id, $2),
             paid_at = coalesce(paid_at, $3),
             updated_at = $4
         where id = $1`,
        [session.id, input.stripePaymentIntentId, input.paidAt, input.occurredAt]
      );

      // Unqualified ON CONFLICT DO NOTHING so a redelivered event (same
      // stripe_event_id) AND a second event for the same payment intent (same
      // shop_id, provider_payment_id) both no-op instead of throwing a unique
      // violation that would 500 the webhook into an infinite Stripe retry.
      const inserted = await queryable.query(
        `insert into relay_payment_events (
           id, shop_id, payment_session_id, stripe_event_id, provider_payment_id,
           provider_session_id, amount_cents, currency, application_fee_cents,
           processor_fee_cents, paid_at, created_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10, $11)
         on conflict do nothing`,
        [
          randomUUID(),
          session.shop_id,
          session.id,
          input.stripeEventId,
          input.stripePaymentIntentId,
          input.stripeCheckoutSessionId,
          input.amountCents,
          input.currency.toUpperCase(),
          session.application_fee_cents,
          input.paidAt,
          input.occurredAt
        ]
      );
      return (inserted.rowCount ?? 0) > 0 ? 'recorded' : 'duplicate';
    });
  }

  async listUndeliveredPaymentEvents(shopId: string): Promise<RelayPaymentEventRecord[]> {
    const result = await this.database.query<PaymentEventRow>(
      `select
         e.id,
         e.payment_session_id,
         s.job_ref,
         s.invoice_ref,
         e.provider_payment_id,
         e.provider_session_id,
         e.amount_cents,
         e.currency,
         e.application_fee_cents,
         e.processor_fee_cents,
         e.paid_at
       from relay_payment_events e
       join relay_payment_sessions s on s.id = e.payment_session_id
       where e.shop_id = $1 and e.delivered_at is null
       order by e.paid_at asc, e.created_at asc`,
      [shopId]
    );
    return result.rows.map(toEventRecord);
  }

  async acknowledgePaymentEvent(
    shopId: string,
    paymentEventId: string,
    deliveredAt: Date
  ): Promise<boolean> {
    const result = await this.database.query(
      `update relay_payment_events
       set delivered_at = coalesce(delivered_at, $3)
       where id = $1 and shop_id = $2`,
      [paymentEventId, shopId, deliveredAt]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async withRefundSessionLock<T>(
    shopId: string,
    stripeCheckoutSessionId: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (queryable) => {
      await queryable.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
        `relay-refund:${shopId}:${stripeCheckoutSessionId}`
      ]);
      return callback();
    });
  }

  async findRefundRequestByIdempotencyKey(
    shopId: string,
    idempotencyKey: string
  ): Promise<RelayPaymentRefundRequestRecord | null> {
    const result = await this.database.query<RefundRequestRow>(
      `select ${REFUND_REQUEST_COLUMNS}
       from relay_payment_refund_requests
       where shop_id = $1 and idempotency_key = $2`,
      [shopId, idempotencyKey]
    );
    return result.rows[0] ? toRefundRequestRecord(result.rows[0]) : null;
  }

  async findPaidSessionForRefund(
    shopId: string,
    stripeCheckoutSessionId: string
  ): Promise<RelayPaymentSessionRecord | null> {
    const result = await this.database.query<PaymentSessionRow>(
      `select ${PAYMENT_SESSION_COLUMNS}
       from relay_payment_sessions
       where shop_id = $1 and stripe_checkout_session_id = $2 and status = 'paid'`,
      [shopId, stripeCheckoutSessionId]
    );
    return result.rows[0] ? toSessionRecord(result.rows[0]) : null;
  }

  async sumConsumedRefundCentsForSession(paymentSessionId: string): Promise<number> {
    const result = await this.database.query<{ consumed: string | number }>(
      `select coalesce(sum(amount_cents), 0) as consumed
       from relay_payment_refund_requests
       where payment_session_id = $1 and status in ('requested', 'succeeded')`,
      [paymentSessionId]
    );
    return Number(result.rows[0]?.consumed ?? 0);
  }

  async createRefundRequest(
    input: Parameters<RelayPaymentsStore['createRefundRequest']>[0]
  ): Promise<RelayPaymentRefundRequestRecord> {
    const inserted = await this.database.query<RefundRequestRow>(
      `insert into relay_payment_refund_requests (
         id, shop_id, payment_session_id, idempotency_key, amount_cents, currency, reason,
         stripe_connected_account_id, stripe_payment_intent_id, application_fee_refunded_cents,
         status, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requested', $11, $11)
       on conflict (shop_id, idempotency_key) do nothing
       returning ${REFUND_REQUEST_COLUMNS}`,
      [
        input.id,
        input.shopId,
        input.paymentSessionId,
        input.idempotencyKey,
        input.amountCents,
        input.currency.toUpperCase(),
        input.reason,
        input.stripeConnectedAccountId,
        input.stripePaymentIntentId,
        input.applicationFeeRefundedCents,
        input.createdAt
      ]
    );
    if (inserted.rows[0]) {
      return toRefundRequestRecord(inserted.rows[0]);
    }
    const existing = await this.findRefundRequestByIdempotencyKey(
      input.shopId,
      input.idempotencyKey
    );
    if (!existing) {
      throw new Error('Refund request insert conflicted but no request was found.');
    }
    return existing;
  }

  async setRefundRequestStripeRefundId(
    input: Parameters<RelayPaymentsStore['setRefundRequestStripeRefundId']>[0]
  ): Promise<void> {
    await this.database.query(
      `update relay_payment_refund_requests
       set stripe_refund_id = $2, updated_at = $3
       where id = $1`,
      [input.id, input.stripeRefundId, input.updatedAt]
    );
  }

  /**
   * Lock and return the refund request matched by a single unique column
   * (`stripe_refund_id` or its primary key `id`), joined to its session for the
   * checkout id. `column` is a fixed literal chosen by this repository, never
   * caller input, so interpolating it is safe. Returns null when no row matches.
   */
  private async lockRefundRequestRow(
    queryable: QueryExecutor,
    column: 'stripe_refund_id' | 'id',
    value: string
  ): Promise<(RefundRequestRow & { stripe_checkout_session_id: string }) | null> {
    const result = await queryable.query<RefundRequestRow & { stripe_checkout_session_id: string }>(
      `select
         r.id, r.shop_id, r.payment_session_id, r.idempotency_key, r.amount_cents,
         r.currency, r.reason, r.stripe_connected_account_id, r.stripe_payment_intent_id,
         r.stripe_refund_id, r.application_fee_refunded_cents, r.status, r.failure_reason,
         r.created_at, r.updated_at,
         s.stripe_checkout_session_id
       from relay_payment_refund_requests r
       join relay_payment_sessions s on s.id = r.payment_session_id
       where r.${column} = $1
       for update of r`,
      [value]
    );
    return result.rows[0] ?? null;
  }

  async recordRefundEvent(
    input: Parameters<RelayPaymentsStore['recordRefundEvent']>[0]
  ): Promise<RecordRefundEventOutcome> {
    return this.database.transaction(async (queryable) => {
      // Resolve which refund request this terminal webhook belongs to. Prefer the
      // Stripe refund id (relay-owned + unique); only fall back to the request id
      // echoed in refund metadata when no refund-id row exists yet — a very fast
      // terminal webhook can arrive before createRefund persisted the refund id,
      // and we must still attach it (and backfill the id). A single `OR` query
      // could match the refund-id row AND a *different* metadata-id row, then
      // advance whichever Postgres happened to return first; resolve the two in
      // order and, if they point at different requests, refuse rather than guess.
      const byRefundId = await this.lockRefundRequestRow(
        queryable,
        'stripe_refund_id',
        input.stripeRefundId
      );
      let request: (RefundRequestRow & { stripe_checkout_session_id: string }) | null = byRefundId;
      if (byRefundId) {
        if (input.refundRequestId !== null && input.refundRequestId !== byRefundId.id) {
          // Metadata names a different request than the one already bound to this
          // refund id — contradictory, so trust neither.
          return 'mismatch';
        }
      } else {
        const byRequestId =
          input.refundRequestId !== null
            ? await this.lockRefundRequestRow(queryable, 'id', input.refundRequestId)
            : null;
        if (
          byRequestId &&
          byRequestId.stripe_refund_id !== null &&
          byRequestId.stripe_refund_id !== input.stripeRefundId
        ) {
          // The metadata request is already bound to a different Stripe refund —
          // this event's refund id can't belong to it.
          return 'mismatch';
        }
        request = byRequestId;
      }
      if (!request) {
        // Out-of-band refund (e.g. created in the Stripe dashboard) — refund
        // events require a BellField request, so there is nothing to attach to.
        return 'requestNotFound';
      }

      // Reconcile the webhook against the request/session we authorized, exactly
      // like the paid-event path: never trust a webhook reporting a different
      // connected account, PaymentIntent, amount, or currency.
      if (
        (input.connectedAccountId !== undefined &&
          input.connectedAccountId !== request.stripe_connected_account_id) ||
        (input.paymentIntentId !== null &&
          input.paymentIntentId !== request.stripe_payment_intent_id) ||
        input.amountCents !== request.amount_cents ||
        input.currency.toUpperCase() !== request.currency.toUpperCase()
      ) {
        return 'mismatch';
      }

      // Insert the canonical event FIRST. A duplicate/contradicting terminal
      // webhook (same refund id) no-ops here and must NOT flip request status —
      // the first terminal event wins.
      const inserted = await queryable.query(
        `insert into relay_payment_refund_events (
           id, shop_id, refund_request_id, payment_session_id, stripe_event_id, stripe_refund_id,
           provider_payment_id, provider_session_id, amount_cents, currency,
           application_fee_refunded_cents, status, failure_reason, occurred_at, created_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
         on conflict do nothing`,
        [
          randomUUID(),
          request.shop_id,
          request.id,
          request.payment_session_id,
          input.stripeEventId,
          input.stripeRefundId,
          request.stripe_payment_intent_id,
          request.stripe_checkout_session_id,
          input.amountCents,
          input.currency.toUpperCase(),
          request.application_fee_refunded_cents,
          input.status,
          input.failureReason,
          input.occurredAt
        ]
      );
      if ((inserted.rowCount ?? 0) === 0) {
        return 'duplicate';
      }

      // Only now that a canonical event row exists do we advance the request, and
      // backfill the Stripe refund id if createRefund hadn't persisted it yet.
      await queryable.query(
        `update relay_payment_refund_requests
         set status = $2,
             failure_reason = $3,
             stripe_refund_id = coalesce(stripe_refund_id, $4),
             updated_at = $5
         where id = $1`,
        [request.id, input.status, input.failureReason, input.stripeRefundId, input.occurredAt]
      );
      return 'recorded';
    });
  }

  async listUndeliveredRefundEvents(shopId: string): Promise<RelayRefundEventRecord[]> {
    const result = await this.database.query<RefundEventRow>(
      `select
         e.id,
         e.refund_request_id,
         e.stripe_refund_id,
         e.provider_payment_id,
         e.provider_session_id,
         s.job_ref,
         e.amount_cents,
         e.currency,
         e.application_fee_refunded_cents,
         e.status,
         e.failure_reason,
         e.occurred_at
       from relay_payment_refund_events e
       join relay_payment_sessions s on s.id = e.payment_session_id
       where e.shop_id = $1 and e.delivered_at is null
       order by e.occurred_at asc, e.created_at asc`,
      [shopId]
    );
    return result.rows.map(toRefundEventRecord);
  }

  async acknowledgeRefundEvent(
    shopId: string,
    refundEventId: string,
    deliveredAt: Date
  ): Promise<boolean> {
    const result = await this.database.query(
      `update relay_payment_refund_events
       set delivered_at = coalesce(delivered_at, $3)
       where id = $1 and shop_id = $2`,
      [refundEventId, shopId, deliveredAt]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toSessionRecord(row: PaymentSessionRow): RelayPaymentSessionRecord {
  return {
    id: row.id,
    shopId: row.shop_id,
    idempotencyKey: row.idempotency_key,
    jobRef: row.job_ref,
    invoiceRef: row.invoice_ref,
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    customerEmail: row.customer_email,
    successUrl: row.success_url,
    cancelUrl: row.cancel_url,
    stripeConnectedAccountId: row.stripe_connected_account_id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    checkoutUrl: row.checkout_url,
    status: row.status,
    applicationFeeCents: row.application_fee_cents,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEventRecord(row: PaymentEventRow): RelayPaymentEventRecord {
  return {
    paymentEventId: row.id,
    paymentSessionId: row.payment_session_id,
    jobRef: row.job_ref,
    invoiceRef: row.invoice_ref,
    provider: 'stripe',
    providerPaymentId: row.provider_payment_id,
    providerSessionId: row.provider_session_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    applicationFeeCents: row.application_fee_cents,
    processorFeeCents: row.processor_fee_cents,
    paidAt: row.paid_at.toISOString()
  };
}

function toRefundRequestRecord(row: RefundRequestRow): RelayPaymentRefundRequestRecord {
  return {
    id: row.id,
    shopId: row.shop_id,
    paymentSessionId: row.payment_session_id,
    idempotencyKey: row.idempotency_key,
    amountCents: row.amount_cents,
    currency: row.currency,
    reason: row.reason,
    stripeConnectedAccountId: row.stripe_connected_account_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeRefundId: row.stripe_refund_id,
    applicationFeeRefundedCents: row.application_fee_refunded_cents,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRefundEventRecord(row: RefundEventRow): RelayRefundEventRecord {
  return {
    refundEventId: row.id,
    refundRequestId: row.refund_request_id,
    provider: 'stripe',
    providerRefundId: row.stripe_refund_id,
    providerPaymentId: row.provider_payment_id,
    providerSessionId: row.provider_session_id,
    jobRef: row.job_ref,
    amountCents: row.amount_cents,
    currency: row.currency,
    applicationFeeRefundedCents: row.application_fee_refunded_cents,
    status: row.status,
    failureReason: row.failure_reason,
    occurredAt: row.occurred_at.toISOString()
  };
}
