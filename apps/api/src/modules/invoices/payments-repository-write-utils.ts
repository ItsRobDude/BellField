import { randomUUID } from 'node:crypto';
import { type QueryExecutor } from '../../database/database.service';
import type {
  PaymentMethodValue,
  PaymentProviderValue,
  PaymentSourceValue
} from './payments.types';
import { normalizeCurrency, toDbSource } from './payments-repository-utils';

const RECEIPT_QUEUE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Insert one append-only payment row. Placeholders are SEQUENTIAL and in column
 * order — this is money code, so no positional `$19`-in-the-middle surprises. The
 * source maps to the DB enum; provider/online fields are null for manual rows.
 * Extracted from the repository so that file stays under the source-size guardrail.
 */
export async function insertPaymentRow(
  queryable: QueryExecutor,
  paymentId: string,
  input: {
    jobId: string;
    invoiceId: string | null;
    amount: number;
    method: PaymentMethodValue;
    source: PaymentSourceValue;
    purpose: 'payment' | 'deposit';
    provider: PaymentProviderValue | null;
    currency: string;
    receivedAt: string;
    reference?: string;
    memo?: string;
    recordedByEmployeeId: string | null;
    recordedByName: string;
    processorFee?: number;
    applicationFee?: number;
    providerPaymentId?: string;
    providerSessionId?: string;
  },
  now: string
): Promise<void> {
  await queryable.query(
    `insert into payments (
       id, job_id, invoice_id, amount, method, source, purpose, provider, currency,
       received_at, reference, memo, recorded_by_employee_id, recorded_by_name,
       processor_fee_amount, application_fee_amount, provider_payment_id,
       provider_session_id, is_void, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, false, $19, $19)`,
    [
      paymentId,
      input.jobId,
      input.invoiceId,
      input.amount,
      input.method,
      toDbSource(input.source),
      input.purpose,
      input.provider,
      normalizeCurrency(input.currency),
      input.receivedAt,
      input.reference?.trim() || null,
      input.memo?.trim() || null,
      input.recordedByEmployeeId,
      input.recordedByName,
      input.processorFee ?? null,
      input.applicationFee ?? null,
      input.providerPaymentId ?? null,
      input.providerSessionId ?? null,
      now
    ]
  );
}

/**
 * Enqueue a customer payment-receipt email in the SAME transaction as the
 * payment insert, so the receipt intent is exactly-once with the money write.
 * The worker resolves the recipient, renders the body, and sends it; the office
 * toggle is honored there (not here), keeping the money path free of a settings
 * read. The unique guard on payment_id makes a duplicated enqueue a no-op.
 */
export async function enqueuePaymentReceipt(
  queryable: QueryExecutor,
  input: {
    paymentId: string;
    jobId: string;
    amount: number;
    method: PaymentMethodValue;
    purpose: 'payment' | 'deposit';
    currency: string;
    occurredAt: string;
  },
  now: string
): Promise<void> {
  const expiresAt = new Date(new Date(now).getTime() + RECEIPT_QUEUE_EXPIRY_MS).toISOString();
  await queryable.query(
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
      normalizeCurrency(input.currency),
      input.method,
      input.purpose,
      input.occurredAt,
      expiresAt,
      now
    ]
  );
}

/**
 * Enqueue a customer refund-receipt email in the SAME transaction as the
 * payment_refunds insert (exactly-once; the unique guard on payment_refund_id
 * makes a duplicated enqueue a no-op). Refund rows carry no `purpose` and the
 * worker's refund copy never uses the method, but the column is stored for the
 * record. The office toggle is honored at send time, not here.
 */
export async function enqueueRefundReceipt(
  queryable: QueryExecutor,
  input: {
    paymentRefundId: string;
    jobId: string;
    amount: number;
    method: PaymentMethodValue;
    currency: string;
    occurredAt: string;
  },
  now: string
): Promise<void> {
  const expiresAt = new Date(new Date(now).getTime() + RECEIPT_QUEUE_EXPIRY_MS).toISOString();
  await queryable.query(
    `insert into payment_receipt_messages (
       id, kind, status, job_id, payment_refund_id, amount, currency, method, purpose,
       occurred_at, expires_at, attempt_count, created_at, updated_at
     )
     values ($1, 'refundReceipt', 'queued', $2, $3, $4, $5, $6, null, $7, $8, 0, $9, $9)
     on conflict (payment_refund_id) where payment_refund_id is not null do nothing`,
    [
      randomUUID(),
      input.jobId,
      input.paymentRefundId,
      input.amount,
      normalizeCurrency(input.currency),
      input.method,
      input.occurredAt,
      expiresAt,
      now
    ]
  );
}
