import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type { PaymentMethodValue, PaymentRecord, PaymentWriteInput } from './payments.types';

type PaymentRow = {
  id: string;
  invoiceId: string;
  amount: string | number;
  method: PaymentMethodValue;
  receivedAt: string | Date;
  reference: string | null;
  memo: string | null;
  recordedByEmployeeId: string;
  recordedByName: string;
  isVoid: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  voidedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const PAYMENT_COLUMNS = `
  id,
  invoice_id as "invoiceId",
  amount,
  method,
  received_at as "receivedAt",
  reference,
  memo,
  recorded_by_employee_id as "recordedByEmployeeId",
  recorded_by_name as "recordedByName",
  is_void as "isVoid",
  void_reason as "voidReason",
  voided_by_name as "voidedByName",
  voided_at as "voidedAt",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Record a payment against a posted invoice, atomically. Locks the invoice row
   * (`for update`) and re-checks status='posted' in-transaction so a payment cannot
   * race a post or land on a draft, then inserts the ledger row and writes a job
   * timeline entry. Credits cannot be paid (you don't pay a reduction).
   */
  async recordPayment(invoiceId: string, input: PaymentWriteInput): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      const invoiceResult = await queryable.query<{
        jobId: string;
        status: string;
        invoiceKind: string;
      }>(
        `select job_id as "jobId", status, invoice_kind as "invoiceKind"
         from invoices where id = $1 limit 1 for update`,
        [invoiceId]
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        throw new NotFoundException('Invoice not found.');
      }
      if (invoice.status !== 'posted') {
        throw new ConflictException('Payments can only be recorded against a posted invoice.');
      }
      if (invoice.invoiceKind === 'credit') {
        throw new ConflictException('A credit cannot be paid; it reduces what is owed.');
      }

      const id = randomUUID();
      await queryable.query(
        `insert into payments (
           id, invoice_id, amount, method, received_at, reference, memo,
           recorded_by_employee_id, recorded_by_name, is_void, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $10)`,
        [
          id,
          invoiceId,
          input.amount,
          input.method,
          input.receivedAt,
          input.reference ?? null,
          input.memo ?? null,
          input.actor.id,
          input.actor.displayName,
          now
        ]
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: invoice.jobId,
          occurredAt: now,
          actorName: input.actor.displayName,
          kind: 'paymentRecorded',
          message: `Payment of ${formatMoney(input.amount)} recorded (${input.method}).`
        },
        queryable
      );

      const created = await queryable.query<PaymentRow>(
        `select ${PAYMENT_COLUMNS} from payments where id = $1`,
        [id]
      );
      return toPaymentRecord(created.rows[0]!);
    });
  }

  /** List a job's payments across its invoices (any kind), newest received first. */
  async listPaymentsForJob(jobId: string): Promise<PaymentRecord[]> {
    const result = await this.databaseService.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS.replace(/\n/g, ' ')}
       from payments p
       where p.invoice_id in (select id from invoices where job_id = $1)
       order by p.received_at desc, p.created_at desc`,
      [jobId]
    );
    return result.rows.map(toPaymentRecord);
  }

  /**
   * Void a payment (the correction path — payments are never edited in place). Locks
   * the payment row, rejects a double-void, writes a job timeline entry, and returns
   * the updated record.
   */
  async voidPayment(
    paymentId: string,
    reason: string | undefined,
    actor: { id: string; displayName: string }
  ): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      const current = await queryable.query<{
        jobId: string;
        isVoid: boolean;
        amount: string | number;
      }>(
        `select inv.job_id as "jobId", p.is_void as "isVoid", p.amount as amount
         from payments p
         join invoices inv on inv.id = p.invoice_id
         where p.id = $1
         for update of p`,
        [paymentId]
      );
      const row = current.rows[0];
      if (!row) {
        throw new NotFoundException('Payment not found.');
      }
      if (row.isVoid) {
        throw new ConflictException('This payment is already void.');
      }

      await queryable.query(
        `update payments set
           is_void = true,
           void_reason = $2,
           voided_by_employee_id = $3,
           voided_by_name = $4,
           voided_at = $5,
           updated_at = $5
         where id = $1`,
        [paymentId, reason?.trim() || null, actor.id, actor.displayName, now]
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: row.jobId,
          occurredAt: now,
          actorName: actor.displayName,
          kind: 'paymentVoided',
          message: `Payment of ${formatMoney(row.amount)} voided.`
        },
        queryable
      );

      const updated = await queryable.query<PaymentRow>(
        `select ${PAYMENT_COLUMNS} from payments where id = $1`,
        [paymentId]
      );
      return toPaymentRecord(updated.rows[0]!);
    });
  }

  /** Sum a job's non-void payments, in whole cents (exact addition of numeric(12,2)). */
  async sumActivePaymentCentsForJob(jobId: string): Promise<number> {
    const result = await this.databaseService.query<{ cents: string | number }>(
      `select coalesce(round(sum(p.amount) * 100), 0) as cents
       from payments p
       where p.is_void = false
         and p.invoice_id in (select id from invoices where job_id = $1)`,
      [jobId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }
}

function formatMoney(amount: number | string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function toPaymentRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amount: Number(row.amount),
    method: row.method,
    receivedAt: toIsoString(row.receivedAt),
    reference: row.reference ?? undefined,
    memo: row.memo ?? undefined,
    recordedByEmployeeId: row.recordedByEmployeeId,
    recordedByName: row.recordedByName,
    isVoid: row.isVoid,
    voidReason: row.voidReason ?? undefined,
    voidedByName: row.voidedByName ?? undefined,
    voidedAt: row.voidedAt ? toIsoString(row.voidedAt) : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}
