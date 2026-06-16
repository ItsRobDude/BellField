import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';

export type OnlinePaymentSessionRecord = {
  id: string;
  jobId: string;
  invoiceId?: string;
  relayPaymentSessionId: string;
  amount: number;
  currency: string;
  checkoutUrl: string;
  status: 'created' | 'paid' | 'failed';
  purpose: 'payment' | 'deposit';
  createdByName: string;
  expiresAt: string;
  paidAt?: string;
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
};

type OnlinePaymentSessionRow = {
  id: string;
  jobId: string;
  invoiceId: string | null;
  relayPaymentSessionId: string;
  amount: string | number;
  currency: string;
  checkoutUrl: string;
  status: OnlinePaymentSessionRecord['status'];
  purpose: 'payment' | 'deposit';
  createdByName: string;
  expiresAt: string | Date;
  paidAt: string | Date | null;
  paymentId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const ONLINE_PAYMENT_SESSION_COLUMNS = `
  id,
  job_id as "jobId",
  invoice_id as "invoiceId",
  relay_payment_session_id as "relayPaymentSessionId",
  amount,
  currency,
  checkout_url as "checkoutUrl",
  status,
  purpose,
  created_by_name as "createdByName",
  expires_at as "expiresAt",
  paid_at as "paidAt",
  payment_id as "paymentId",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class OnlinePaymentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async recordCreated(input: {
    jobId: string;
    invoiceId?: string | null;
    relayPaymentSessionId: string;
    amount: number;
    currency: string;
    checkoutUrl: string;
    createdByEmployeeId: string;
    createdByName: string;
    expiresAt: string;
    purpose?: 'payment' | 'deposit';
  }): Promise<OnlinePaymentSessionRecord> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      const result = await queryable.query<OnlinePaymentSessionRow & { inserted: boolean }>(
        `insert into online_payment_sessions (
           id, job_id, invoice_id, relay_payment_session_id, amount, currency,
           checkout_url, status, purpose, created_by_employee_id, created_by_name,
           expires_at, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, 'created', $8, $9, $10, $11, $12, $12)
         on conflict (relay_payment_session_id) do update
           set checkout_url = excluded.checkout_url,
               expires_at = excluded.expires_at,
               updated_at = excluded.updated_at
         returning ${ONLINE_PAYMENT_SESSION_COLUMNS}, (xmax = 0) as "inserted"`,
        [
          randomUUID(),
          input.jobId,
          input.invoiceId ?? null,
          input.relayPaymentSessionId,
          input.amount,
          input.currency,
          input.checkoutUrl,
          input.purpose ?? 'payment',
          input.createdByEmployeeId,
          input.createdByName,
          input.expiresAt,
          now
        ]
      );
      const row = result.rows[0]!;
      // `xmax = 0` is true only for a freshly inserted row; an upsert that took
      // the conflict-update path (a concurrent retry of the same relay session)
      // returns false. Only the real creation writes a timeline entry, so a
      // double-submit can't leave two "Payment link created" notes on the job.
      if (row.inserted) {
        await insertJobTimelineEntry(
          {
            id: randomUUID(),
            jobId: input.jobId,
            occurredAt: now,
            actorName: input.createdByName,
            kind: 'paymentLinkCreated',
            message:
              input.purpose === 'deposit'
                ? `Deposit link created for ${formatMoney(input.amount)}.`
                : `Payment link created for ${formatMoney(input.amount)}.`
          },
          queryable
        );
      }
      return toRecord(row);
    });
  }

  async findByRelayPaymentSessionId(
    relayPaymentSessionId: string
  ): Promise<OnlinePaymentSessionRecord | null> {
    const result = await this.databaseService.query<OnlinePaymentSessionRow>(
      `select ${ONLINE_PAYMENT_SESSION_COLUMNS}
       from online_payment_sessions
       where relay_payment_session_id = $1`,
      [relayPaymentSessionId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async listForJobAmount(input: {
    jobId: string;
    invoiceId?: string | null;
    amount: number;
    currency: string;
  }): Promise<OnlinePaymentSessionRecord[]> {
    // Match on integer cents rather than the decimal-dollar column so the lookup
    // never rides on float equality (and reads the same way the worker does).
    const result = await this.databaseService.query<OnlinePaymentSessionRow>(
      `select ${ONLINE_PAYMENT_SESSION_COLUMNS}
       from online_payment_sessions
       where job_id = $1
         and round(amount * 100) = $2
         and currency = $3
         and (
           ($4::text is null and invoice_id is null)
           or ($4::text is not null and invoice_id = $4)
         )
       order by created_at asc, id asc`,
      [
        input.jobId,
        Math.round(input.amount * 100),
        input.currency.toUpperCase(),
        input.invoiceId ?? null
      ]
    );
    return result.rows.map(toRecord);
  }

  async sumActiveCreatedSessionCentsForJob(input: {
    jobId: string;
    currency: string;
    now: Date;
  }): Promise<number> {
    const result = await this.databaseService.query<{ cents: string | number | null }>(
      `select coalesce(sum(round(amount * 100)), 0) as cents
       from online_payment_sessions
       where job_id = $1
         and currency = $2
         and status = 'created'
         and expires_at > $3`,
      [input.jobId, input.currency.toUpperCase(), input.now]
    );
    return Number(result.rows[0]?.cents ?? 0);
  }

  async markPaid(input: {
    relayPaymentSessionId: string;
    paymentId: string;
    paidAt: string;
  }): Promise<void> {
    await this.databaseService.query(
      `update online_payment_sessions
       set status = 'paid',
           payment_id = $2,
           paid_at = $3,
           updated_at = $3
       where relay_payment_session_id = $1
         and status <> 'paid'`,
      [input.relayPaymentSessionId, input.paymentId, input.paidAt]
    );
  }
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function toRecord(row: OnlinePaymentSessionRow): OnlinePaymentSessionRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    invoiceId: row.invoiceId ?? undefined,
    relayPaymentSessionId: row.relayPaymentSessionId,
    amount: Number(row.amount),
    currency: row.currency,
    checkoutUrl: row.checkoutUrl,
    status: row.status,
    purpose: row.purpose,
    createdByName: row.createdByName,
    expiresAt: new Date(row.expiresAt).toISOString(),
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : undefined,
    paymentId: row.paymentId ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}
