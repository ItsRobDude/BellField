import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../common/database';

const RECEIPT_QUEUE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Enqueue a customer payment-receipt row from inside the worker's online-payment
 * apply transaction (exactly-once with the payment insert; the unique guard on
 * payment_id makes a duplicated enqueue a no-op). Deliberately payment-specific:
 * it always writes a `paymentReceipt` row keyed to a payment_id and never a
 * refund-shaped row — refund receipts get their own path in a later slice.
 *
 * `occurredAt` is the customer's actual paid time (Stripe `paidAt`) so the
 * receipt date matches when they paid; `now` is worker processing time and
 * drives created/updated/expires.
 */
export async function enqueuePaymentReceiptRow(
  tx: QueryExecutor,
  input: {
    paymentId: string;
    jobId: string;
    /** Decimal dollars string, matching the recorded payment amount. */
    amount: string;
    currency: string;
    method: string;
    purpose: 'payment' | 'deposit';
    occurredAt: Date;
  },
  now: Date
): Promise<void> {
  const expiresAt = new Date(now.getTime() + RECEIPT_QUEUE_EXPIRY_MS);
  await tx.query(
    `insert into payment_receipt_messages (
       id, kind, status, job_id, payment_id, amount, currency, method, purpose,
       occurred_at, expires_at, attempt_count, created_at, updated_at
     )
     values ($1, 'paymentReceipt', 'queued', $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $10)
     on conflict (payment_id) where payment_id is not null do nothing`,
    [
      randomUUID(),
      input.jobId,
      input.paymentId,
      input.amount,
      input.currency,
      input.method,
      input.purpose,
      input.occurredAt,
      expiresAt,
      now
    ]
  );
}
