import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';

/** A pending online-refund request as the repository reads/writes it. */
export type OnlineRefundRequestRecord = {
  id: string;
  paymentId: string;
  jobId: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
  relayRefundRequestId?: string;
  providerRefundId?: string;
  status: 'requested' | 'succeeded' | 'failed';
  failureReason?: string;
  lastError?: string;
  requestedByName: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The minimal shape the service needs to call the relay after a pending request is
 * created or reused. `providerSessionId` is the payment's Stripe checkout session
 * id (the relay-owned session reference); `reused` is true when an outstanding
 * request for the same (payment, amount) was returned instead of a new one.
 */
export type PendingOnlineRefund = {
  id: string;
  idempotencyKey: string;
  providerSessionId: string;
  amount: number;
  currency: string;
  reused: boolean;
};

@Injectable()
export class OnlineRefundsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Validate and open a pending online refund, or reuse the outstanding request
   * for the same (payment, amount). Runs in ONE short transaction: it locks the
   * job row then the payment row (the same lock order recordPayment/refundPayment
   * use, so concurrent money writes on the job serialize and can't deadlock), and
   * the locks are released at commit — the caller makes the relay network call
   * OUTSIDE this transaction. Throws NotFound/Conflict for the office to surface.
   */
  async createOrReusePending(
    paymentId: string,
    input: { amount: number; reason?: string; actor: { id: string; displayName: string } }
  ): Promise<PendingOnlineRefund> {
    const now = new Date().toISOString();
    const requestedCents = dollarsToCents(input.amount);
    return this.databaseService.transaction(async (queryable) => {
      const head = await queryable.query<{ jobId: string }>(
        `select job_id as "jobId" from payments where id = $1 limit 1`,
        [paymentId]
      );
      if (!head.rows[0]) {
        throw new NotFoundException('Payment not found.');
      }
      await this.lockJobRow(head.rows[0].jobId, queryable);

      const current = await queryable.query<{
        jobId: string;
        amount: string | number;
        currency: string;
        source: string;
        providerSessionId: string | null;
        isVoid: boolean;
      }>(
        `select job_id as "jobId", amount, currency, source,
                provider_session_id as "providerSessionId", is_void as "isVoid"
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
      if (payment.source === 'manual') {
        throw new ConflictException(
          'A manually recorded payment is refunded directly, not through the processor.'
        );
      }
      if (!payment.providerSessionId) {
        throw new ConflictException('This payment cannot be refunded online.');
      }

      const currency = normalizeCurrency(payment.currency);

      // Reuse an outstanding (still requested) refund for the SAME (payment,
      // amount): a double-submit then re-attempts the relay with the same key
      // rather than opening a second refund.
      const existing = await queryable.query<{ id: string; idempotencyKey: string }>(
        `select id, idempotency_key as "idempotencyKey"
         from online_refund_requests
         where payment_id = $1 and round(amount * 100) = $2 and status = 'requested'
         order by created_at asc, id asc
         limit 1
         for update`,
        [paymentId, requestedCents]
      );
      if (existing.rows[0]) {
        return {
          id: existing.rows[0].id,
          idempotencyKey: existing.rows[0].idempotencyKey,
          providerSessionId: payment.providerSessionId,
          amount: input.amount,
          currency,
          reused: true
        };
      }

      // Remaining refundable = payment − confirmed refunds − outstanding requests.
      const paymentCents = dollarsToCents(Number(payment.amount));
      const confirmedCents = await this.sumConfirmedRefundCentsForPayment(paymentId, queryable);
      const outstandingCents = await this.sumOutstandingRequestCentsForPayment(
        paymentId,
        queryable
      );
      const refundableCents = paymentCents - confirmedCents - outstandingCents;
      if (requestedCents > refundableCents) {
        throw new ConflictException(
          refundableCents <= 0
            ? 'This payment has already been fully refunded.'
            : `Refund exceeds the ${formatMoney(centsToDollars(refundableCents))} still refundable on this payment.`
        );
      }

      // Count ALL prior requests for this (payment, amount) so a legitimate repeat
      // refund (after an earlier one settled) gets a fresh, unique key.
      const priorCount = await queryable.query<{ count: string | number }>(
        `select count(*) as count
         from online_refund_requests
         where payment_id = $1 and round(amount * 100) = $2`,
        [paymentId, requestedCents]
      );
      const attempt = Number(priorCount.rows[0]?.count ?? 0) + 1;
      const idempotencyKey = `online-refund:${paymentId}:${requestedCents}:attempt-${attempt}`;

      const id = randomUUID();
      await queryable.query(
        `insert into online_refund_requests (
           id, payment_id, job_id, amount, currency, reason, idempotency_key,
           status, requested_by_employee_id, requested_by_name, requested_at,
           created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $9, $10, $10, $10)`,
        [
          id,
          paymentId,
          payment.jobId,
          input.amount,
          currency,
          input.reason ?? null,
          idempotencyKey,
          input.actor.id,
          input.actor.displayName,
          now
        ]
      );

      return {
        id,
        idempotencyKey,
        providerSessionId: payment.providerSessionId,
        amount: input.amount,
        currency,
        reused: false
      };
    });
  }

  /** The relay accepted the refund: record its ids; the request stays 'requested'
   * until the worker confirms the Stripe refund event. */
  async markRelayAccepted(input: {
    id: string;
    relayRefundRequestId: string;
    providerRefundId: string;
  }): Promise<void> {
    await this.databaseService.query(
      `update online_refund_requests
       set relay_refund_request_id = $2,
           provider_refund_id = coalesce(provider_refund_id, $3),
           last_error = null,
           updated_at = $4
       where id = $1`,
      [input.id, input.relayRefundRequestId, input.providerRefundId, new Date().toISOString()]
    );
  }

  /** A transient relay failure: keep the request 'requested' (retryable with the
   * same idempotency key) and record the last error. */
  async markRelayError(input: { id: string; lastError: string }): Promise<void> {
    await this.databaseService.query(
      `update online_refund_requests
       set last_error = $2,
           updated_at = $3
       where id = $1`,
      [input.id, input.lastError, new Date().toISOString()]
    );
  }

  /** A terminal relay rejection: the refund will not happen for this request. */
  async markFailed(input: { id: string; failureReason: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `update online_refund_requests
       set status = 'failed',
           failure_reason = $2,
           failed_at = $3,
           updated_at = $3
       where id = $1`,
      [input.id, input.failureReason, now]
    );
  }

  private async sumConfirmedRefundCentsForPayment(
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

  private async sumOutstandingRequestCentsForPayment(
    paymentId: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ cents: string | number }>(
      `select coalesce(round(sum(amount) * 100), 0) as cents
       from online_refund_requests
       where payment_id = $1 and status = 'requested'`,
      [paymentId]
    );
    return Number(result.rows[0]?.cents ?? 0);
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
}

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
