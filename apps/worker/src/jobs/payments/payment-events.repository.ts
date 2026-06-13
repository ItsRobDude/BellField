import { randomUUID } from 'node:crypto';
import type { RelayPaymentEvent } from '../delivery/delivery-types';
import type {
  PaymentEventApplyOutcome,
  PaymentEventsDatabase,
  PaymentEventsQueryExecutor,
  PaymentEventsStore
} from './payment-events.types';

type ExistingPaymentRow = {
  id: string;
};

type OnlinePaymentSessionRow = {
  jobId: string;
  invoiceId: string | null;
};

type ChargeInvoiceRow = {
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment';
  total: string | number;
  allocated: string | number;
};

export class PaymentEventsRepository implements PaymentEventsStore {
  constructor(private readonly database: PaymentEventsDatabase) {}

  async applyRelayPaymentEvent(
    event: RelayPaymentEvent,
    occurredAt: Date
  ): Promise<PaymentEventApplyOutcome> {
    return this.database.transaction(async (tx) => {
      const existingPaymentId = await this.findExistingPaymentId(tx, event);
      const paidAt = parseIsoDate(event.paidAt);

      if (existingPaymentId) {
        await this.markOnlinePaymentSessionPaid(
          tx,
          event.paymentSessionId,
          existingPaymentId,
          paidAt
        );
        return 'alreadyApplied';
      }

      const session = await this.findOnlinePaymentSessionForUpdate(tx, event.paymentSessionId);
      const jobId = session?.jobId ?? event.jobRef;
      await this.lockJob(tx, jobId);
      await this.lockPostedInvoicesForJob(tx, jobId);

      const paymentId = randomUUID();
      await tx.query(
        `insert into payments (
           id, job_id, invoice_id, amount, method, source, provider, currency,
           received_at, reference, memo, recorded_by_employee_id, recorded_by_name,
           processor_fee_amount, application_fee_amount, provider_payment_id,
           provider_session_id, is_void, created_at, updated_at
         )
         values ($1, $2, $3, $4, 'card', 'bellfield_payments', 'stripe', $5,
                 $6, $7, null, null, 'BellField Payments',
                 $8, $9, $10, $11, false, $12, $12)`,
        [
          paymentId,
          jobId,
          session?.invoiceId ?? event.invoiceRef ?? null,
          centsToDollarsString(event.amountCents),
          event.currency.trim().toUpperCase(),
          paidAt,
          `Stripe ${event.providerPaymentId}`,
          event.processorFeeCents === null ? null : centsToDollarsString(event.processorFeeCents),
          centsToDollarsString(event.applicationFeeCents),
          event.providerPaymentId,
          event.providerSessionId,
          occurredAt
        ]
      );

      await this.insertAutoAllocations(tx, paymentId, jobId, event.amountCents, occurredAt);
      await this.markOnlinePaymentSessionPaid(tx, event.paymentSessionId, paymentId, paidAt);
      await this.addTimelineEntry(tx, jobId, event.amountCents, occurredAt);
      return 'applied';
    });
  }

  private async findExistingPaymentId(
    tx: PaymentEventsQueryExecutor,
    event: RelayPaymentEvent
  ): Promise<string | null> {
    const result = await tx.query<ExistingPaymentRow>(
      `select id
       from payments
       where provider = $1 and provider_payment_id = $2
       limit 1`,
      [event.provider, event.providerPaymentId]
    );
    return result.rows[0]?.id ?? null;
  }

  private async findOnlinePaymentSessionForUpdate(
    tx: PaymentEventsQueryExecutor,
    relayPaymentSessionId: string
  ): Promise<OnlinePaymentSessionRow | null> {
    const result = await tx.query<OnlinePaymentSessionRow>(
      `select job_id as "jobId", invoice_id as "invoiceId"
       from online_payment_sessions
       where relay_payment_session_id = $1
       for update`,
      [relayPaymentSessionId]
    );
    return result.rows[0] ?? null;
  }

  private async lockJob(tx: PaymentEventsQueryExecutor, jobId: string): Promise<void> {
    const result = await tx.query<{ id: string }>(`select id from jobs where id = $1 for update`, [
      jobId
    ]);
    if (!result.rows[0]) {
      throw new Error(`Payment event referenced unknown job ${jobId}.`);
    }
  }

  private async lockPostedInvoicesForJob(
    tx: PaymentEventsQueryExecutor,
    jobId: string
  ): Promise<void> {
    await tx.query(
      `select id from invoices
       where job_id = $1 and status = 'posted'
       order by id
       for update`,
      [jobId]
    );
  }

  private async markOnlinePaymentSessionPaid(
    tx: PaymentEventsQueryExecutor,
    relayPaymentSessionId: string,
    paymentId: string,
    paidAt: Date
  ): Promise<void> {
    await tx.query(
      `update online_payment_sessions
       set status = 'paid',
           payment_id = $2,
           paid_at = coalesce(paid_at, $3),
           updated_at = $3
       where relay_payment_session_id = $1
         and status <> 'paid'`,
      [relayPaymentSessionId, paymentId, paidAt]
    );
  }

  private async addTimelineEntry(
    tx: PaymentEventsQueryExecutor,
    jobId: string,
    amountCents: number,
    occurredAt: Date
  ): Promise<void> {
    await tx.query('update jobs set updated_at = $2 where id = $1', [jobId, occurredAt]);
    await tx.query(
      `insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
       values ($1, $2, $3, 'BellField Payments', 'paymentRecorded', $4)`,
      [randomUUID(), jobId, occurredAt, `Online payment of ${formatCents(amountCents)} confirmed.`]
    );
  }

  private async insertAutoAllocations(
    tx: PaymentEventsQueryExecutor,
    paymentId: string,
    jobId: string,
    paymentCents: number,
    occurredAt: Date
  ): Promise<void> {
    const [chargeRows, creditTotalCents, activePaidBeforeThisCents] = await Promise.all([
      this.listPostedChargeInvoiceBalances(tx, jobId),
      this.sumPostedCreditCentsForJob(tx, jobId),
      this.sumActivePaymentCentsForJob(tx, jobId, paymentId)
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
      await tx.query(
        `insert into payment_allocations (id, payment_id, invoice_id, amount, created_at)
         values ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          paymentId,
          invoice.invoiceId,
          centsToDollarsString(allocationCents),
          occurredAt
        ]
      );
      remainingToAllocateCents -= allocationCents;
    }
  }

  private async listPostedChargeInvoiceBalances(
    tx: PaymentEventsQueryExecutor,
    jobId: string
  ): Promise<Array<ChargeInvoiceRow & { remainingCents: number }>> {
    const result = await tx.query<ChargeInvoiceRow>(
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
    tx: PaymentEventsQueryExecutor,
    jobId: string
  ): Promise<number> {
    const result = await tx.query<{ cents: string | number }>(
      `select coalesce(round(sum(total_amount) * 100), 0) as cents
       from invoices
       where job_id = $1
         and status = 'posted'
         and invoice_kind = 'credit'`,
      [jobId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  private async sumActivePaymentCentsForJob(
    tx: PaymentEventsQueryExecutor,
    jobId: string,
    excludedPaymentId: string
  ): Promise<number> {
    const result = await tx.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from payments
       where is_void = false
         and job_id = $1
         and id <> $2`,
      [jobId, excludedPaymentId]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Payment event paidAt was not a valid timestamp.');
  }
  return parsed;
}

function dollarsToCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function centsToDollarsString(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

function formatCents(cents: number): string {
  return `$${centsToDollarsString(cents)}`;
}
