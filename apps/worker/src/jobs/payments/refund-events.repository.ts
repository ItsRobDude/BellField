import { randomUUID } from 'node:crypto';
import { workerLog } from '../../common/logger';
import type { RelayRefundEvent } from '../delivery/delivery-types';
import type {
  RefundEventApplyOutcome,
  RefundEventsDatabase,
  RefundEventsQueryExecutor,
  RefundEventsStore
} from './refund-events.types';

// How many times a succeeded refund event may defer (waiting for its payment to be
// recorded) before it is dead-lettered. At the shared payment-event poll interval
// (~60s) this is ~30 minutes. Injectable so tests can drive the bound cheaply.
const DEFAULT_MAX_APPLY_ATTEMPTS = 30;

type RefundRequestMatch = {
  id: string;
  jobId: string;
};

type RefundAllocationRow = {
  invoiceId: string;
  allocatedCents: string | number;
  refundedCents: string | number;
};

export class RefundEventsRepository implements RefundEventsStore {
  private readonly maxApplyAttempts: number;

  constructor(
    private readonly database: RefundEventsDatabase,
    options?: { maxApplyAttempts?: number }
  ) {
    this.maxApplyAttempts = options?.maxApplyAttempts ?? DEFAULT_MAX_APPLY_ATTEMPTS;
  }

  async applyRelayRefundEvent(
    event: RelayRefundEvent,
    occurredAt: Date
  ): Promise<RefundEventApplyOutcome> {
    return this.database.transaction(async (tx) => {
      // 1. Idempotent on the Stripe refund id: a redelivered event no-ops, but we
      // still reconcile the pending request in case a prior apply crashed between
      // the ledger write and the request update.
      if (await this.refundAlreadyRecorded(tx, event)) {
        await this.reconcileRequestSucceeded(tx, event, null, occurredAt);
        return 'alreadyApplied';
      }

      // 2. A failed refund moved no money: mark the pending request failed and
      // surface it; never write a refund row.
      if (event.status === 'failed') {
        return this.recordFailedRefund(tx, event, occurredAt);
      }

      // 3. A succeeded refund can only be applied once the original payment exists
      // locally (the paid event may not have been picked up yet). Until then,
      // defer — and dead-letter if it never arrives.
      const payment = await this.findPaymentByProviderPaymentId(tx, event);
      if (!payment) {
        return this.deferOrDeadLetter(tx, event, occurredAt);
      }

      await this.lockJob(tx, payment.jobId);
      await this.lockPostedInvoicesForJob(tx, payment.jobId);

      const refundId = randomUUID();
      const refundedAt = parseIsoDate(event.occurredAt);
      await tx.query(
        `insert into payment_refunds (
           id, payment_id, job_id, amount, method, currency, source, provider,
           provider_refund_id, provider_payment_id, application_fee_refunded, reason,
           refunded_by_employee_id, refunded_by_name, refunded_at, created_at, updated_at
         )
         values ($1, $2, $3, $4, 'card', $5, 'bellfield_payments', 'stripe',
                 $6, $7, $8, null, null, 'BellField Payments', $9, $10, $10)`,
        [
          refundId,
          payment.id,
          payment.jobId,
          centsToDollarsString(event.amountCents),
          event.currency.trim().toUpperCase(),
          event.providerRefundId,
          event.providerPaymentId,
          event.applicationFeeRefundedCents === null
            ? null
            : centsToDollarsString(event.applicationFeeRefundedCents),
          refundedAt,
          occurredAt
        ]
      );

      await this.insertRefundReversalAllocations(
        tx,
        refundId,
        payment.id,
        event.amountCents,
        occurredAt
      );
      await this.reconcileRequestSucceeded(tx, event, payment.id, occurredAt);
      await this.addRefundTimeline(tx, payment.jobId, event.amountCents, occurredAt);
      return 'applied';
    });
  }

  private async refundAlreadyRecorded(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent
  ): Promise<boolean> {
    const result = await tx.query<{ id: string }>(
      `select id from payment_refunds
       where provider = $1 and provider_refund_id = $2
       limit 1`,
      [event.provider, event.providerRefundId]
    );
    return Boolean(result.rows[0]);
  }

  private async findPaymentByProviderPaymentId(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent
  ): Promise<{ id: string; jobId: string } | null> {
    const result = await tx.query<{ id: string; jobId: string }>(
      `select id, job_id as "jobId" from payments
       where provider = $1 and provider_payment_id = $2
       limit 1`,
      [event.provider, event.providerPaymentId]
    );
    return result.rows[0] ?? null;
  }

  private async recordFailedRefund(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent,
    occurredAt: Date
  ): Promise<RefundEventApplyOutcome> {
    const payment = await this.findPaymentByProviderPaymentId(tx, event);
    const request = await this.findRefundRequest(tx, event, payment?.id ?? null);
    if (!request) {
      workerLog('info', 'Refund failed event matched no local refund request.', {
        refundEventId: event.refundEventId,
        providerRefundId: event.providerRefundId
      });
      return 'failedRecorded';
    }
    await tx.query(
      `update online_refund_requests
       set status = 'failed',
           failure_reason = $2,
           failed_at = $3,
           updated_at = $3
       where id = $1`,
      [request.id, event.failureReason ?? 'The refund did not complete.', occurredAt]
    );
    await this.addRefundFailedTimeline(tx, request.jobId, event.amountCents, occurredAt);
    return 'failedRecorded';
  }

  private async deferOrDeadLetter(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent,
    occurredAt: Date
  ): Promise<RefundEventApplyOutcome> {
    // No local payment means the paid event hasn't been applied yet. Bump the
    // request's apply attempts; once past the bound, stop retrying forever and
    // dead-letter it. The (payment, amount) fallback can't apply here (no payment),
    // so match the request by its provider/relay ids only.
    const request = await this.findRefundRequest(tx, event, null);
    if (!request) {
      workerLog('info', 'Refund event has no recorded payment or request yet; deferring.', {
        refundEventId: event.refundEventId,
        providerPaymentId: event.providerPaymentId
      });
      return 'deferred';
    }

    const updated = await tx.query<{ applyAttemptCount: string | number }>(
      `update online_refund_requests
       set apply_attempt_count = apply_attempt_count + 1,
           last_apply_error = $2,
           last_apply_attempt_at = $3,
           updated_at = $3
       where id = $1
       returning apply_attempt_count as "applyAttemptCount"`,
      [request.id, 'Payment for this refund is not recorded yet.', occurredAt]
    );
    const attempts = Number(updated.rows[0]?.applyAttemptCount ?? 0);
    if (attempts < this.maxApplyAttempts) {
      return 'deferred';
    }

    // Past the bound: the payment never landed. Fail the request and surface it.
    await tx.query(
      `update online_refund_requests
       set status = 'failed',
           failure_reason = $2,
           failed_at = $3,
           updated_at = $3
       where id = $1`,
      [request.id, 'The refund could not be confirmed after repeated attempts.', occurredAt]
    );
    await this.addRefundFailedTimeline(tx, request.jobId, event.amountCents, occurredAt);
    workerLog('error', 'Refund event dead-lettered after exceeding the apply bound.', {
      refundEventId: event.refundEventId,
      providerRefundId: event.providerRefundId,
      attempts
    });
    return 'deadLettered';
  }

  /**
   * Find the local pending request for this event: by Stripe refund id first, then
   * by the relay's request id, then (when a payment is known) by the outstanding
   * (payment, amount) request — which covers the case where the API timed out
   * before it stored either id.
   */
  private async findRefundRequest(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent,
    paymentId: string | null
  ): Promise<RefundRequestMatch | null> {
    const byRefundId = await tx.query<RefundRequestMatch>(
      `select id, job_id as "jobId" from online_refund_requests
       where provider_refund_id = $1 limit 1`,
      [event.providerRefundId]
    );
    if (byRefundId.rows[0]) {
      return byRefundId.rows[0];
    }
    const byRequestId = await tx.query<RefundRequestMatch>(
      `select id, job_id as "jobId" from online_refund_requests
       where relay_refund_request_id = $1 limit 1`,
      [event.refundRequestId]
    );
    if (byRequestId.rows[0]) {
      return byRequestId.rows[0];
    }
    if (paymentId) {
      const byOutstanding = await tx.query<RefundRequestMatch>(
        `select id, job_id as "jobId" from online_refund_requests
         where payment_id = $1 and round(amount * 100) = $2 and status = 'requested'
         order by created_at asc, id asc
         limit 1`,
        [paymentId, event.amountCents]
      );
      if (byOutstanding.rows[0]) {
        return byOutstanding.rows[0];
      }
    }
    return null;
  }

  private async reconcileRequestSucceeded(
    tx: RefundEventsQueryExecutor,
    event: RelayRefundEvent,
    paymentId: string | null,
    occurredAt: Date
  ): Promise<void> {
    const request = await this.findRefundRequest(tx, event, paymentId);
    if (!request) {
      return;
    }
    await tx.query(
      `update online_refund_requests
       set status = 'succeeded',
           provider_refund_id = coalesce(provider_refund_id, $2),
           relay_refund_request_id = coalesce(relay_refund_request_id, $3),
           last_apply_error = null,
           updated_at = $4
       where id = $1`,
      [request.id, event.providerRefundId, event.refundRequestId, occurredAt]
    );
  }

  private async insertRefundReversalAllocations(
    tx: RefundEventsQueryExecutor,
    refundId: string,
    paymentId: string,
    refundCents: number,
    occurredAt: Date
  ): Promise<void> {
    // Reverse the payment's allocations main-first, up to the refund amount, net of
    // any allocations earlier refunds already reversed (mirrors the API manual
    // refund). Any remainder maps to an unallocated/overpayment portion of the
    // payment and needs no allocation row — it still reduces net paid via the
    // payment_refunds.amount.
    const result = await tx.query<RefundAllocationRow>(
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
      await tx.query(
        `insert into payment_refund_allocations (id, refund_id, invoice_id, amount, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), refundId, row.invoiceId, centsToDollarsString(reverseCents), occurredAt]
      );
      remainingCents -= reverseCents;
    }
  }

  private async lockJob(tx: RefundEventsQueryExecutor, jobId: string): Promise<void> {
    const result = await tx.query<{ id: string }>(`select id from jobs where id = $1 for update`, [
      jobId
    ]);
    if (!result.rows[0]) {
      throw new Error(`Refund event referenced unknown job ${jobId}.`);
    }
  }

  private async lockPostedInvoicesForJob(
    tx: RefundEventsQueryExecutor,
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

  private async addRefundTimeline(
    tx: RefundEventsQueryExecutor,
    jobId: string,
    amountCents: number,
    occurredAt: Date
  ): Promise<void> {
    await tx.query('update jobs set updated_at = $2 where id = $1', [jobId, occurredAt]);
    await tx.query(
      `insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
       values ($1, $2, $3, 'BellField Payments', 'paymentRefunded', $4)`,
      [randomUUID(), jobId, occurredAt, `Online refund of ${formatCents(amountCents)} confirmed.`]
    );
  }

  private async addRefundFailedTimeline(
    tx: RefundEventsQueryExecutor,
    jobId: string,
    amountCents: number,
    occurredAt: Date
  ): Promise<void> {
    await tx.query('update jobs set updated_at = $2 where id = $1', [jobId, occurredAt]);
    await tx.query(
      `insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
       values ($1, $2, $3, 'BellField Payments', 'paymentRefundFailed', $4)`,
      [
        randomUUID(),
        jobId,
        occurredAt,
        `Online refund of ${formatCents(amountCents)} could not be completed.`
      ]
    );
  }
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Refund event occurredAt was not a valid timestamp.');
  }
  return parsed;
}

function centsToDollarsString(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

function formatCents(cents: number): string {
  return `$${centsToDollarsString(cents)}`;
}
