import { type QueryExecutor } from '../../database/database.service';
import type {
  PaymentMethodValue,
  PaymentProviderValue,
  PaymentSourceValue
} from './payments.types';
import { normalizeCurrency, toDbSource } from './payments-repository-utils';

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
