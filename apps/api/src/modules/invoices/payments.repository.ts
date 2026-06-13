import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  PaymentAllocationRecord,
  PaymentMethodValue,
  PaymentProviderValue,
  PaymentRecord,
  PaymentSourceValue,
  PaymentWriteInput,
  ProviderPaymentWriteInput
} from './payments.types';

type PaymentRow = {
  id: string;
  jobId: string;
  invoiceId: string | null;
  amount: string | number;
  method: PaymentMethodValue;
  source: 'manual' | 'bellfield_payments';
  provider: PaymentProviderValue | null;
  currency: string;
  receivedAt: string | Date;
  reference: string | null;
  memo: string | null;
  recordedByEmployeeId: string | null;
  recordedByName: string;
  processorFee: string | number | null;
  applicationFee: string | number | null;
  providerPaymentId: string | null;
  providerSessionId: string | null;
  isVoid: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  voidedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type AllocationRow = {
  paymentId: string;
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment' | 'credit';
  amount: string | number;
};

type ChargeInvoiceRow = {
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment';
  total: string | number;
  allocated: string | number;
};

type TargetInvoiceRow = {
  jobId: string;
  status: string;
  invoiceKind: string;
};

const PAYMENT_COLUMNS = `
  id,
  job_id as "jobId",
  invoice_id as "invoiceId",
  amount,
  method,
  source,
  provider,
  currency,
  received_at as "receivedAt",
  reference,
  memo,
  recorded_by_employee_id as "recordedByEmployeeId",
  recorded_by_name as "recordedByName",
  processor_fee_amount as "processorFee",
  application_fee_amount as "applicationFee",
  provider_payment_id as "providerPaymentId",
  provider_session_id as "providerSessionId",
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
   * Record a manual payment from the invoice surface. The invoice id remains the
   * office user's context/anchor, but the receipt is job-level and allocations are
   * authoritative. This fixes the old "all payments hang off the main invoice"
   * shortcut without adding an allocation editor to v1.
   */
  async recordPayment(invoiceId: string, input: PaymentWriteInput): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      const target = await this.lockJobForPayment(invoiceId, queryable);
      const paymentId = randomUUID();
      await this.insertPayment(
        paymentId,
        {
          jobId: target.jobId,
          invoiceId,
          amount: input.amount,
          method: input.method,
          source: 'manual',
          provider: null,
          currency: 'USD',
          receivedAt: input.receivedAt,
          reference: input.reference,
          memo: input.memo,
          recordedByEmployeeId: input.actor.id,
          recordedByName: input.actor.displayName,
          processorFee: undefined,
          applicationFee: undefined,
          providerPaymentId: undefined,
          providerSessionId: undefined
        },
        now,
        queryable
      );
      await this.insertAutoAllocations(
        paymentId,
        target.jobId,
        dollarsToCents(input.amount),
        now,
        queryable
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: target.jobId,
          occurredAt: now,
          actorName: input.actor.displayName,
          kind: 'paymentRecorded',
          message: `Payment of ${formatMoney(input.amount)} recorded (${input.method}).`
        },
        queryable
      );

      return this.findPaymentById(paymentId, queryable);
    });
  }

  /**
   * Record a provider-confirmed BellField Payments receipt. Idempotency is keyed
   * by provider + providerPaymentId so relay redelivery and worker retries are safe.
   */
  async recordProviderPayment(input: ProviderPaymentWriteInput): Promise<PaymentRecord> {
    const existing = await this.findProviderPayment(input.provider, input.providerPaymentId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      const inTransactionExisting = await this.findProviderPayment(
        input.provider,
        input.providerPaymentId,
        queryable
      );
      if (inTransactionExisting) {
        return inTransactionExisting;
      }

      await this.lockPostedInvoicesForJob(input.jobId, queryable);
      const paymentId = randomUUID();
      await this.insertPayment(
        paymentId,
        {
          jobId: input.jobId,
          invoiceId: null,
          amount: input.amount,
          method: 'card',
          source: 'bellfieldPayments',
          provider: input.provider,
          currency: normalizeCurrency(input.currency),
          receivedAt: input.receivedAt,
          reference: input.reference,
          memo: input.memo,
          recordedByEmployeeId: null,
          recordedByName: 'BellField Payments',
          processorFee: input.processorFee,
          applicationFee: input.applicationFee,
          providerPaymentId: input.providerPaymentId,
          providerSessionId: input.providerSessionId
        },
        now,
        queryable
      );
      await this.insertAutoAllocations(
        paymentId,
        input.jobId,
        dollarsToCents(input.amount),
        now,
        queryable
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: input.jobId,
          occurredAt: now,
          actorName: 'BellField Payments',
          kind: 'paymentRecorded',
          message: `Online payment of ${formatMoney(input.amount)} confirmed.`
        },
        queryable
      );

      return this.findPaymentById(paymentId, queryable);
    });
  }

  /** List a job's payments (manual and provider-confirmed), newest received first. */
  async listPaymentsForJob(jobId: string): Promise<PaymentRecord[]> {
    const result = await this.databaseService.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS.replace(/\n/g, ' ')}
       from payments p
       where p.job_id = $1
       order by p.received_at desc, p.created_at desc`,
      [jobId]
    );
    return this.hydratePayments(result.rows, this.databaseService);
  }

  /**
   * Void a payment (the correction path — payments are never edited in place).
   * Allocations stay as historical evidence, but every balance/read path ignores
   * allocations attached to a voided payment.
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
        source: PaymentRow['source'];
      }>(
        `select job_id as "jobId", is_void as "isVoid", amount, source
         from payments
         where id = $1
         for update`,
        [paymentId]
      );
      const row = current.rows[0];
      if (!row) {
        throw new NotFoundException('Payment not found.');
      }
      if (row.isVoid) {
        throw new ConflictException('This payment is already void.');
      }
      if (row.source !== 'manual') {
        throw new ConflictException(
          'Online payments cannot be voided manually. Handle any refund or correction with the processor first.'
        );
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

      return this.findPaymentById(paymentId, queryable);
    });
  }

  /** Sum a job's non-void payments, in whole cents (exact addition of numeric(12,2)). */
  async sumActivePaymentCentsForJob(jobId: string): Promise<number> {
    const result = await this.databaseService.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payments
       where is_void = false
         and job_id = $1`,
      [jobId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  /**
   * Acquire payment locks in a single consistent order: the job row, then the
   * job's posted invoices by id. The target invoice is read (not locked) first
   * only to find its job and validate it — locking the single target row before
   * the ordered set would let two payments on different invoices of the same
   * job deadlock (each holding the other's target row). Posting is monotonic,
   * so reading the target unlocked is safe.
   */
  private async lockJobForPayment(
    invoiceId: string,
    queryable: QueryExecutor
  ): Promise<TargetInvoiceRow> {
    const invoiceResult = await queryable.query<TargetInvoiceRow>(
      `select job_id as "jobId", status, invoice_kind as "invoiceKind"
       from invoices where id = $1 limit 1`,
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
    await this.lockJobRow(invoice.jobId, queryable);
    await this.lockPostedInvoicesForJob(invoice.jobId, queryable);
    return invoice;
  }

  private async lockJobRow(jobId: string, queryable: QueryExecutor): Promise<void> {
    const result = await queryable.query<{ id: string }>(
      `select id from jobs where id = $1 for update`,
      [jobId]
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Job not found.');
    }
  }

  private async lockPostedInvoicesForJob(jobId: string, queryable: QueryExecutor): Promise<void> {
    await queryable.query(
      `select id from invoices
       where job_id = $1 and status = 'posted'
       order by id
       for update`,
      [jobId]
    );
  }

  private async insertPayment(
    paymentId: string,
    input: {
      jobId: string;
      invoiceId: string | null;
      amount: number;
      method: PaymentMethodValue;
      source: PaymentSourceValue;
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
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    await queryable.query(
      `insert into payments (
         id, job_id, invoice_id, amount, method, source, provider, currency,
         received_at, reference, memo, recorded_by_employee_id, recorded_by_name,
         processor_fee_amount, application_fee_amount, provider_payment_id,
         provider_session_id, is_void, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, false, $18, $18)`,
      [
        paymentId,
        input.jobId,
        input.invoiceId,
        input.amount,
        input.method,
        toDbSource(input.source),
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

  private async insertAutoAllocations(
    paymentId: string,
    jobId: string,
    paymentCents: number,
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    const [chargeRows, creditTotalCents, activePaidBeforeThisCents] = await Promise.all([
      this.listPostedChargeInvoiceBalances(jobId, queryable),
      this.sumPostedCreditCentsForJob(jobId, queryable),
      this.sumActivePaymentCentsForJobInTransaction(jobId, paymentId, queryable)
    ]);

    const positiveChargeTotalCents = chargeRows.reduce(
      (sum, row) => sum + dollarsToCents(row.total),
      0
    );
    const positiveUnpaidCents = chargeRows.reduce((sum, row) => sum + row.remainingCents, 0);
    const netDueBeforeThisPaymentCents = Math.max(
      positiveChargeTotalCents - creditTotalCents - activePaidBeforeThisCents,
      0
    );
    let remainingToAllocateCents = Math.min(
      paymentCents,
      positiveUnpaidCents,
      netDueBeforeThisPaymentCents
    );

    for (const invoice of chargeRows) {
      if (remainingToAllocateCents <= 0) {
        break;
      }
      const allocationCents = Math.min(invoice.remainingCents, remainingToAllocateCents);
      if (allocationCents <= 0) {
        continue;
      }
      await queryable.query(
        `insert into payment_allocations (id, payment_id, invoice_id, amount, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), paymentId, invoice.invoiceId, centsToDollars(allocationCents), now]
      );
      remainingToAllocateCents -= allocationCents;
    }
  }

  private async listPostedChargeInvoiceBalances(
    jobId: string,
    queryable: QueryExecutor
  ): Promise<Array<ChargeInvoiceRow & { remainingCents: number }>> {
    const result = await queryable.query<ChargeInvoiceRow>(
      `with active_allocations as (
         select pa.invoice_id, coalesce(sum(pa.amount), 0) as allocated
         from payment_allocations pa
         join payments p on p.id = pa.payment_id
         where p.is_void = false
         group by pa.invoice_id
       )
       select
         i.id as "invoiceId",
         i.invoice_kind as "invoiceKind",
         i.total_amount as total,
         coalesce(aa.allocated, 0) as allocated
       from invoices i
       left join active_allocations aa on aa.invoice_id = i.id
       where i.job_id = $1
         and i.status = 'posted'
         and i.invoice_kind in ('main', 'adjustment')
       order by
         case when i.invoice_kind = 'main' then 0 else 1 end,
         i.posted_at asc nulls last,
         i.id asc`,
      [jobId]
    );
    return result.rows
      .map((row) => ({
        ...row,
        remainingCents: Math.max(dollarsToCents(row.total) - dollarsToCents(row.allocated), 0)
      }))
      .filter((row) => row.remainingCents > 0);
  }

  private async sumPostedCreditCentsForJob(
    jobId: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ cents: string | number }>(
      `select coalesce(round(sum(total_amount) * 100), 0) as cents
       from invoices
       where job_id = $1
         and status = 'posted'
         and invoice_kind = 'credit'`,
      [jobId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  private async sumActivePaymentCentsForJobInTransaction(
    jobId: string,
    excludedPaymentId: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payments
       where is_void = false
         and job_id = $1
         and id <> $2`,
      [jobId, excludedPaymentId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  private async findPaymentById(
    paymentId: string,
    queryable: QueryExecutor
  ): Promise<PaymentRecord> {
    const result = await queryable.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS} from payments where id = $1`,
      [paymentId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Payment not found.');
    }
    const [payment] = await this.hydratePayments([row], queryable);
    return payment;
  }

  private async findProviderPayment(
    provider: PaymentProviderValue,
    providerPaymentId: string,
    queryable: QueryExecutor = this.databaseService
  ): Promise<PaymentRecord | null> {
    const result = await queryable.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS} from payments
       where provider = $1 and provider_payment_id = $2
       limit 1`,
      [provider, providerPaymentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    const [payment] = await this.hydratePayments([result.rows[0]], queryable);
    return payment;
  }

  private async hydratePayments(
    rows: PaymentRow[],
    queryable: QueryExecutor
  ): Promise<PaymentRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const paymentIds = rows.map((row) => row.id);
    const allocationsResult = await queryable.query<AllocationRow>(
      `select
         pa.payment_id as "paymentId",
         pa.invoice_id as "invoiceId",
         i.invoice_kind as "invoiceKind",
         pa.amount
       from payment_allocations pa
       join invoices i on i.id = pa.invoice_id
       where pa.payment_id = any($1::text[])
       order by
         pa.payment_id,
         case when i.invoice_kind = 'main' then 0 else 1 end,
         i.posted_at asc nulls last,
         i.id asc`,
      [paymentIds]
    );
    const allocationsByPayment = new Map<string, PaymentAllocationRecord[]>();
    for (const allocation of allocationsResult.rows) {
      const current = allocationsByPayment.get(allocation.paymentId) ?? [];
      current.push({
        invoiceId: allocation.invoiceId,
        invoiceKind: allocation.invoiceKind,
        amount: Number(allocation.amount)
      });
      allocationsByPayment.set(allocation.paymentId, current);
    }
    return rows.map((row) => toPaymentRecord(row, allocationsByPayment.get(row.id) ?? []));
  }
}

function formatMoney(amount: number | string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function dollarsToCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function toDbSource(source: PaymentSourceValue): 'manual' | 'bellfield_payments' {
  return source === 'bellfieldPayments' ? 'bellfield_payments' : 'manual';
}

function fromDbSource(source: PaymentRow['source']): PaymentSourceValue {
  return source === 'bellfield_payments' ? 'bellfieldPayments' : 'manual';
}

function optionalMoney(value: string | number | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function toPaymentRecord(row: PaymentRow, allocations: PaymentAllocationRecord[]): PaymentRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    invoiceId: row.invoiceId ?? undefined,
    amount: Number(row.amount),
    method: row.method,
    source: fromDbSource(row.source),
    provider: row.provider ?? undefined,
    currency: row.currency,
    receivedAt: toIsoString(row.receivedAt),
    reference: row.reference ?? undefined,
    memo: row.memo ?? undefined,
    recordedByEmployeeId: row.recordedByEmployeeId ?? undefined,
    recordedByName: row.recordedByName,
    processorFee: optionalMoney(row.processorFee),
    applicationFee: optionalMoney(row.applicationFee),
    providerPaymentId: row.providerPaymentId ?? undefined,
    providerSessionId: row.providerSessionId ?? undefined,
    allocations,
    isVoid: row.isVoid,
    voidReason: row.voidReason ?? undefined,
    voidedByName: row.voidedByName ?? undefined,
    voidedAt: row.voidedAt ? toIsoString(row.voidedAt) : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}
