import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  PaymentAllocationRecord,
  PaymentMethodValue,
  PaymentRecord,
  PaymentRefundAllocationRecord,
  PaymentWriteInput,
  RefundRecord,
  RefundWriteInput
} from './payments.types';
import {
  PAYMENT_COLUMNS,
  REFUND_COLUMNS,
  centsToDollars,
  dollarsToCents,
  formatMoney,
  normalizeCurrency,
  toPaymentRecord,
  toRefundRecord,
  type AllocationRow,
  type ChargeInvoiceRow,
  type PaymentRow,
  type RefundAllocationRow,
  type RefundRow,
  type TargetInvoiceRow
} from './payments-repository-utils';
import { enqueuePaymentReceipt, insertPaymentRow } from './payments-repository-write-utils';

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
      return this.insertManualReceipt(
        {
          jobId: target.jobId,
          invoiceId,
          purpose: 'payment',
          input,
          timelineMessage: `Payment of ${formatMoney(input.amount)} recorded (${input.method}).`
        },
        now,
        queryable
      );
    });
  }

  /**
   * Record a manual JOB-LEVEL deposit (cash/check/card the office took directly).
   * Unlike recordPayment it is NOT scoped to a posted invoice — a deposit can be
   * collected before anything is billed and lands as unallocated job credit until
   * there are posted charges to apply it to. `purpose = 'deposit'` carries the
   * durable business meaning; the money otherwise reuses the same insert/allocate core.
   */
  async recordDeposit(jobId: string, input: PaymentWriteInput): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      // Same lock order as recordPayment (job row, then posted invoices) so manual
      // deposits and payments on a job can't deadlock against each other.
      await this.lockJobRow(jobId, queryable);
      await this.lockPostedInvoicesForJob(jobId, queryable);
      return this.insertManualReceipt(
        {
          jobId,
          invoiceId: null,
          purpose: 'deposit',
          input,
          timelineMessage: `Deposit of ${formatMoney(input.amount)} recorded (${input.method}).`
        },
        now,
        queryable
      );
    });
  }

  /**
   * Shared core for a manual receipt the office records directly (the caller owns
   * lock acquisition + the purpose): insert the append-only payment row
   * (source=manual), auto-allocate it across the job's posted charges main-first
   * (any unallocated remainder is job credit), and write the timeline entry.
   */
  private async insertManualReceipt(
    args: {
      jobId: string;
      invoiceId: string | null;
      purpose: 'payment' | 'deposit';
      input: PaymentWriteInput;
      timelineMessage: string;
    },
    now: string,
    queryable: QueryExecutor
  ): Promise<PaymentRecord> {
    const { jobId, invoiceId, purpose, input, timelineMessage } = args;
    const paymentId = randomUUID();
    await insertPaymentRow(
      queryable,
      paymentId,
      {
        jobId,
        invoiceId,
        amount: input.amount,
        method: input.method,
        source: 'manual',
        purpose,
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
      now
    );
    await this.insertAutoAllocations(
      paymentId,
      jobId,
      dollarsToCents(input.amount),
      now,
      queryable
    );
    await insertJobTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt: now,
        actorName: input.actor.displayName,
        kind: 'paymentRecorded',
        message: timelineMessage
      },
      queryable
    );
    await enqueuePaymentReceipt(
      queryable,
      {
        paymentId,
        jobId,
        amount: input.amount,
        method: input.method,
        purpose,
        currency: 'USD',
        occurredAt: input.receivedAt
      },
      now
    );
    return this.findPaymentById(paymentId, queryable);
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
      // A refund already reversed part/all of this payment; voiding it too would
      // drop the payment from the paid total while the refund still counts,
      // inflating the balance. Correct with a compensating payment instead.
      const refundCheck = await queryable.query(
        `select 1 from payment_refunds where payment_id = $1 limit 1`,
        [paymentId]
      );
      if (refundCheck.rows.length > 0) {
        throw new ConflictException(
          'This payment has refunds recorded and cannot be voided. Record a correcting payment instead.'
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

  /** Sum a job's refunds, in whole cents. Refunds are terminal, so all count. */
  async sumActiveRefundCentsForJob(jobId: string): Promise<number> {
    const result = await this.databaseService.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payment_refunds
       where job_id = $1`,
      [jobId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  /** List a job's refunds, newest first. */
  async listRefundsForJob(jobId: string): Promise<RefundRecord[]> {
    const result = await this.databaseService.query<RefundRow>(
      `select ${REFUND_COLUMNS.replace(/\n/g, ' ')}
       from payment_refunds
       where job_id = $1
       order by refunded_at desc, created_at desc`,
      [jobId]
    );
    return this.hydrateRefunds(result.rows, this.databaseService);
  }

  /**
   * Record a manual refund of all or part of a payment (the slice-1 path; online
   * card refunds are recorded by the worker from a confirmed Stripe event). The
   * refund reverses the payment's allocations main-first so each posted charge
   * invoice's remaining balance stays exact, and the job's amount due rises by the
   * refunded amount. Append-only — it never edits the payment or a posted invoice.
   */
  async refundPayment(paymentId: string, input: RefundWriteInput): Promise<RefundRecord> {
    const now = new Date().toISOString();
    const requestedCents = dollarsToCents(input.amount);
    return this.databaseService.transaction(async (queryable) => {
      // Read unlocked to find the job (amount is immutable); we re-lock + re-check below.
      const head = await queryable.query<{ jobId: string }>(
        `select job_id as "jobId" from payments where id = $1 limit 1`,
        [paymentId]
      );
      if (!head.rows[0]) {
        throw new NotFoundException('Payment not found.');
      }
      // Same lock order as recordPayment (job row, then posted invoices), then the
      // payment row last — so concurrent payments/refunds on the job can't deadlock.
      await this.lockJobRow(head.rows[0].jobId, queryable);
      await this.lockPostedInvoicesForJob(head.rows[0].jobId, queryable);

      const current = await queryable.query<{
        jobId: string;
        amount: string | number;
        method: PaymentMethodValue;
        currency: string;
        source: PaymentRow['source'];
        isVoid: boolean;
      }>(
        `select job_id as "jobId", amount, method, currency, source, is_void as "isVoid"
         from payments where id = $1 for update`,
        [paymentId]
      );
      const payment = current.rows[0];
      if (!payment) {
        throw new NotFoundException('Payment not found.');
      }
      if (payment.isVoid) {
        throw new ConflictException('A voided payment cannot be refunded.');
      }
      if (payment.source !== 'manual') {
        throw new ConflictException(
          'Online card payments must be refunded through the processor, not recorded manually.'
        );
      }

      const paymentCents = dollarsToCents(payment.amount);
      const alreadyRefundedCents = await this.sumRefundCentsForPayment(paymentId, queryable);
      const refundableCents = paymentCents - alreadyRefundedCents;
      if (requestedCents > refundableCents) {
        throw new ConflictException(
          refundableCents <= 0
            ? 'This payment has already been fully refunded.'
            : `Refund exceeds the ${formatMoney(centsToDollars(refundableCents))} still refundable on this payment.`
        );
      }

      const refundId = randomUUID();
      await queryable.query(
        `insert into payment_refunds (
           id, payment_id, job_id, amount, method, currency, source, provider,
           provider_refund_id, provider_payment_id, application_fee_refunded, reason,
           refunded_by_employee_id, refunded_by_name, refunded_at, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, 'manual', null, null, null, null, $7, $8, $9, $10, $10, $10)`,
        [
          refundId,
          paymentId,
          payment.jobId,
          input.amount,
          payment.method,
          normalizeCurrency(payment.currency),
          input.reason?.trim() || null,
          input.actor.id,
          input.actor.displayName,
          now
        ]
      );

      await this.insertRefundReversalAllocations(
        refundId,
        paymentId,
        requestedCents,
        now,
        queryable
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: payment.jobId,
          occurredAt: now,
          actorName: input.actor.displayName,
          kind: 'paymentRefunded',
          message: `Refund of ${formatMoney(input.amount)} recorded (${payment.method}).`
        },
        queryable
      );

      return this.findRefundById(refundId, queryable);
    });
  }

  /** Sum the refunds already taken against a single payment, in whole cents. */
  private async sumRefundCentsForPayment(
    paymentId: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payment_refunds
       where payment_id = $1`,
      [paymentId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  /**
   * Reverse the payment's allocations main-first, up to the refund amount, net of
   * any allocations already reversed by prior partial refunds. Any remainder maps
   * to an unallocated (overpayment) portion of the payment and needs no allocation
   * row — it still reduces job-level net paid via payment_refunds.amount.
   */
  private async insertRefundReversalAllocations(
    refundId: string,
    paymentId: string,
    refundCents: number,
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    const result = await queryable.query<{
      invoiceId: string;
      allocatedCents: string | number;
      refundedCents: string | number;
    }>(
      `select
         pa.invoice_id as "invoiceId",
         round(pa.amount * 100) as "allocatedCents",
         coalesce((
           select round(sum(ra.amount) * 100)
           from payment_refund_allocations ra
           join payment_refunds r on r.id = ra.refund_id
           where r.payment_id = pa.payment_id and ra.invoice_id = pa.invoice_id
         ), 0) as "refundedCents"
       from payment_allocations pa
       join invoices i on i.id = pa.invoice_id
       where pa.payment_id = $1
       order by
         case when i.invoice_kind = 'main' then 0 else 1 end,
         i.posted_at asc nulls last,
         i.id asc`,
      [paymentId]
    );

    let remainingCents = refundCents;
    for (const row of result.rows) {
      if (remainingCents <= 0) {
        break;
      }
      const reversibleCents = Number(row.allocatedCents) - Number(row.refundedCents);
      if (reversibleCents <= 0) {
        continue;
      }
      const reverseCents = Math.min(reversibleCents, remainingCents);
      await queryable.query(
        `insert into payment_refund_allocations (id, refund_id, invoice_id, amount, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), refundId, row.invoiceId, centsToDollars(reverseCents), now]
      );
      remainingCents -= reverseCents;
    }
  }

  private async findRefundById(refundId: string, queryable: QueryExecutor): Promise<RefundRecord> {
    const result = await queryable.query<RefundRow>(
      `select ${REFUND_COLUMNS} from payment_refunds where id = $1`,
      [refundId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Refund not found.');
    }
    const [refund] = await this.hydrateRefunds([row], queryable);
    return refund;
  }

  private async hydrateRefunds(
    rows: RefundRow[],
    queryable: QueryExecutor
  ): Promise<RefundRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const refundIds = rows.map((row) => row.id);
    const allocationsResult = await queryable.query<RefundAllocationRow>(
      `select
         ra.refund_id as "refundId",
         ra.invoice_id as "invoiceId",
         i.invoice_kind as "invoiceKind",
         ra.amount
       from payment_refund_allocations ra
       join invoices i on i.id = ra.invoice_id
       where ra.refund_id = any($1::text[])
       order by
         ra.refund_id,
         case when i.invoice_kind = 'main' then 0 else 1 end,
         i.posted_at asc nulls last,
         i.id asc`,
      [refundIds]
    );
    const allocationsByRefund = new Map<string, PaymentRefundAllocationRecord[]>();
    for (const allocation of allocationsResult.rows) {
      const current = allocationsByRefund.get(allocation.refundId) ?? [];
      current.push({
        invoiceId: allocation.invoiceId,
        invoiceKind: allocation.invoiceKind,
        amount: Number(allocation.amount)
      });
      allocationsByRefund.set(allocation.refundId, current);
    }
    return rows.map((row) => toRefundRecord(row, allocationsByRefund.get(row.id) ?? []));
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

  private async insertAutoAllocations(
    paymentId: string,
    jobId: string,
    paymentCents: number,
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    const [chargeRows, creditTotalCents, activePaidBeforeThisCents, refundedBeforeThisCents] =
      await Promise.all([
        this.listPostedChargeInvoiceBalances(jobId, queryable),
        this.sumPostedCreditCentsForJob(jobId, queryable),
        this.sumActivePaymentCentsForJobInTransaction(jobId, paymentId, queryable),
        this.sumRefundCentsForJobInTransaction(jobId, queryable)
      ]);

    const positiveChargeTotalCents = chargeRows.reduce(
      (sum, row) => sum + dollarsToCents(row.total),
      0
    );
    const positiveUnpaidCents = chargeRows.reduce((sum, row) => sum + row.remainingCents, 0);
    // Effective paid by OTHER payments = their gross minus refunds taken against
    // them (the new payment has no refunds yet). Without subtracting refunds a
    // fully-refunded prior payment would wrongly cap this payment's allocation to 0.
    const effectivePaidBeforeThisCents = Math.max(
      activePaidBeforeThisCents - refundedBeforeThisCents,
      0
    );
    const netDueBeforeThisPaymentCents = Math.max(
      positiveChargeTotalCents - creditTotalCents - effectivePaidBeforeThisCents,
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
       ),
       refunded_allocations as (
         select ra.invoice_id, coalesce(sum(ra.amount), 0) as refunded
         from payment_refund_allocations ra
         group by ra.invoice_id
       )
       select
         i.id as "invoiceId",
         i.invoice_kind as "invoiceKind",
         i.total_amount as total,
         coalesce(aa.allocated, 0) - coalesce(ra.refunded, 0) as allocated
       from invoices i
       left join active_allocations aa on aa.invoice_id = i.id
       left join refunded_allocations ra on ra.invoice_id = i.id
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

  private async sumRefundCentsForJobInTransaction(
    jobId: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payment_refunds
       where job_id = $1`,
      [jobId]
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
