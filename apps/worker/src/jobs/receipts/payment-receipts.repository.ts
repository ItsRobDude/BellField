import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../common/database';
import type {
  DueReceipt,
  ExpiredReceipt,
  PaymentReceiptKind,
  PaymentReceiptStore,
  ReceiptRecipient,
  ReceiptSettings,
  ReceiptTimelineEntry
} from './receipt-types';

type DueRow = {
  id: string;
  kind: PaymentReceiptKind;
  job_id: string;
  amount: string;
  currency: string;
  method: string;
  purpose: 'payment' | 'deposit' | null;
  occurred_at: Date;
  attempt_count: number;
  recipient_email: string | null;
  subject: string | null;
  body_text: string | null;
};

type SettingsRow = {
  company_name: string;
  reply_to_email: string | null;
  send_payment_receipts: boolean;
  payment_receipt_email_subject: string;
  payment_receipt_email_body: string;
};

type RecipientRow = { jobNumber: string; customerName: string; email: string | null };

// Same lease window as the delivery queue: claiming pushes next_attempt_at out
// so a second worker pass cannot pick the same receipt up mid-send.
const claimLeaseMs = 10 * 60 * 1000;

export class PaymentReceiptsRepository implements PaymentReceiptStore {
  constructor(private readonly database: QueryExecutor) {}

  async claimDueQueued(now: Date, limit: number): Promise<DueReceipt[]> {
    const leaseUntil = new Date(now.getTime() + claimLeaseMs);
    const result = await this.database.query<DueRow>(
      `
        update payment_receipt_messages claimed
        set next_attempt_at = $3,
            updated_at = $1
        from (
          select prm.id
          from payment_receipt_messages prm
          where prm.status = 'queued'
            and (prm.expires_at is null or prm.expires_at > $1)
            and (prm.next_attempt_at is null or prm.next_attempt_at <= $1)
          order by prm.next_attempt_at asc nulls first
          limit $2
          for update skip locked
        ) due
        where claimed.id = due.id
        returning
          claimed.id, claimed.kind, claimed.job_id, claimed.amount, claimed.currency,
          claimed.method, claimed.purpose, claimed.occurred_at, claimed.attempt_count,
          claimed.recipient_email, claimed.subject, claimed.body_text
      `,
      [now, limit, leaseUntil]
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      jobId: row.job_id,
      amount: row.amount,
      currency: row.currency,
      method: row.method,
      purpose: row.purpose,
      occurredAt: row.occurred_at,
      attemptCount: row.attempt_count,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      bodyText: row.body_text
    }));
  }

  async loadSettings(): Promise<ReceiptSettings> {
    const result = await this.database.query<SettingsRow>(
      `
        select company_name, reply_to_email, send_payment_receipts,
               payment_receipt_email_subject, payment_receipt_email_body
        from company_settings
        where id = 'default'
        limit 1
      `
    );
    const row = result.rows[0];
    if (!row) {
      // No settings row yet: default to sending with neutral copy so a recorded
      // payment is not silently un-receipted before the owner visits settings.
      return {
        companyName: 'BellField',
        replyToEmail: null,
        sendPaymentReceipts: true,
        paymentReceiptEmailSubject: 'Receipt from {companyName}',
        paymentReceiptEmailBody:
          'Hello {customerName},\n\nWe received your {receiptKind} of {amount} by {method} on {date} for job {jobNumber}.\n\nThank you,\n{companyName}'
      };
    }
    return {
      companyName: row.company_name,
      replyToEmail: row.reply_to_email,
      sendPaymentReceipts: row.send_payment_receipts,
      paymentReceiptEmailSubject: row.payment_receipt_email_subject,
      paymentReceiptEmailBody: row.payment_receipt_email_body
    };
  }

  async resolveRecipient(jobId: string): Promise<ReceiptRecipient> {
    const result = await this.database.query<RecipientRow>(
      `
        select
          j.job_number as "jobNumber",
          c.name as "customerName",
          (
            select m.value
            from crm_contact_methods m
            where m.owner_kind = 'customer'
              and m.customer_id = c.id
              and m.is_active = true
              and m.ended_at is null
              and m.kind = 'email'
            order by m.is_primary desc, m.created_at asc, m.id asc
            limit 1
          ) as email
        from jobs j
        join customers c on c.id = j.bill_to_customer_id
        where j.id = $1
        limit 1
      `,
      [jobId]
    );
    const row = result.rows[0];
    if (!row) {
      return { email: null, customerName: 'Customer', jobNumber: '' };
    }
    return {
      email: row.email && row.email.trim() ? row.email.trim() : null,
      customerName: row.customerName,
      jobNumber: row.jobNumber
    };
  }

  async pinRendered(
    id: string,
    fields: { recipientEmail: string; subject: string; bodyText: string },
    now: Date
  ): Promise<void> {
    await this.database.query(
      `update payment_receipt_messages
       set recipient_email = $2, subject = $3, body_text = $4, updated_at = $5
       where id = $1`,
      [id, fields.recipientEmail, fields.subject, fields.bodyText, now]
    );
  }

  async markSent(id: string, providerMessageId: string | null, now: Date): Promise<void> {
    await this.database.query(
      `update payment_receipt_messages
       set status = 'sent', provider_message_id = $2, provider_error = null,
           sent_at = $3, updated_at = $3
       where id = $1`,
      [id, providerMessageId, now]
    );
  }

  async scheduleRetry(id: string, nextAttemptAt: Date, now: Date): Promise<void> {
    await this.database.query(
      `update payment_receipt_messages
       set status = 'queued', attempt_count = attempt_count + 1,
           next_attempt_at = $2, updated_at = $3
       where id = $1`,
      [id, nextAttemptAt, now]
    );
  }

  async markFailed(id: string, error: string, now: Date): Promise<void> {
    await this.database.query(
      `update payment_receipt_messages
       set status = 'failed', attempt_count = attempt_count + 1,
           provider_error = $2, updated_at = $3
       where id = $1`,
      [id, error, now]
    );
  }

  async cancel(id: string, now: Date): Promise<void> {
    await this.database.query(
      `update payment_receipt_messages
       set status = 'canceled', updated_at = $2
       where id = $1`,
      [id, now]
    );
  }

  async expireDue(now: Date): Promise<ExpiredReceipt[]> {
    const result = await this.database.query<{
      id: string;
      job_id: string;
      kind: PaymentReceiptKind;
    }>(
      `update payment_receipt_messages
       set status = 'failed', provider_error = 'expired', updated_at = $1
       where status = 'queued' and expires_at is not null and expires_at <= $1
       returning id, job_id, kind`,
      [now]
    );
    return result.rows.map((row) => ({ id: row.id, jobId: row.job_id, kind: row.kind }));
  }

  async addTimelineEntry(entry: ReceiptTimelineEntry): Promise<void> {
    await this.database.query(
      `insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
       values ($1, $2, $3, 'BellField Payments', $4, $5)`,
      [randomUUID(), entry.jobId, entry.occurredAt, entry.kind, entry.message]
    );
  }
}
