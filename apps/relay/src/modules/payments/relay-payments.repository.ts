import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type {
  RecordPaidEventOutcome,
  RelayPaymentSessionRecord,
  RelayPaymentsStore,
  RelayShopPaymentsConfig
} from './payments.types';
import type { RelayPaymentEventRecord } from '@bellfield/contracts';

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
