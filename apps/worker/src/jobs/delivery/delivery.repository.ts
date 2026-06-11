import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../common/database';
import type {
  DeliveryStore,
  DeliveryTimelineEntry,
  DueQueuedDelivery,
  ExpiredDelivery,
  PollableDelivery
} from './delivery-types';

type DueRow = {
  id: string;
  job_id: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  from_name: string | null;
  reply_to_email: string | null;
  sent_by_name: string;
  attempt_count: number;
  expires_at: Date | null;
  storage_path: string;
  sha256: string;
  filename: string;
  estimate_title: string | null;
};

type ExpiredRow = {
  id: string;
  job_id: string;
  recipient_email: string;
  sent_by_name: string;
  estimate_title: string | null;
};

export class DeliveryRepository implements DeliveryStore {
  constructor(private readonly database: QueryExecutor) {}

  async listDueQueued(now: Date, limit: number): Promise<DueQueuedDelivery[]> {
    // next_attempt_at is set by a retryable failure. A queued row with no
    // next_attempt_at and an old queued_at is an interrupted synchronous send
    // (API crashed mid-flight); after a grace period the worker picks it up —
    // the relay's idempotent replay makes a duplicate attempt harmless.
    const result = await this.database.query<DueRow>(
      `
        select om.id, om.job_id, om.recipient_email, om.subject, om.body_text,
               om.from_name, om.reply_to_email, om.sent_by_name, om.attempt_count, om.expires_at,
               cds.storage_path, cds.sha256, cds.filename,
               (select title from estimates e where e.id = om.estimate_id) as estimate_title
        from outbound_messages om
        join customer_document_snapshots cds on cds.id = om.document_snapshot_id
        where om.status = 'queued'
          and (om.expires_at is null or om.expires_at > $1)
          and (
            (om.next_attempt_at is not null and om.next_attempt_at <= $1)
            or (om.next_attempt_at is null and om.queued_at <= $1::timestamptz - interval '10 minutes')
          )
        order by om.next_attempt_at asc nulls last
        limit $2
      `,
      [now, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      bodyText: row.body_text,
      fromName: row.from_name,
      replyToEmail: row.reply_to_email,
      sentByName: row.sent_by_name,
      attemptCount: row.attempt_count,
      expiresAt: row.expires_at,
      snapshotStoragePath: row.storage_path,
      snapshotSha256: row.sha256,
      snapshotFilename: row.filename,
      estimateTitle: row.estimate_title
    }));
  }

  async markSent(id: string, providerMessageId: string | null, sentAt: Date): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set status = 'sent',
            sent_at = $2,
            provider_message_id = $3,
            provider_error = null,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            updated_at = $2
        where id = $1 and status = 'queued'
      `,
      [id, sentAt, providerMessageId]
    );
  }

  async markFailed(id: string, code: string, failedAt: Date): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set status = 'failed',
            provider_error = $2,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            updated_at = $3
        where id = $1 and status = 'queued'
      `,
      [id, code, failedAt]
    );
  }

  async scheduleRetry(id: string, nextAttemptAt: Date, occurredAt: Date): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set attempt_count = attempt_count + 1,
            next_attempt_at = $2,
            updated_at = $3
        where id = $1 and status = 'queued'
      `,
      [id, nextAttemptAt, occurredAt]
    );
  }

  async expireDue(now: Date, legacyCutoff: Date): Promise<ExpiredDelivery[]> {
    const result = await this.database.query<ExpiredRow>(
      `
        update outbound_messages om
        set status = 'failed',
            provider_error = 'expired',
            next_attempt_at = null,
            updated_at = $1
        where om.status = 'queued'
          and (
            om.expires_at <= $1
            or (om.expires_at is null and om.queued_at <= $2)
          )
        returning om.id, om.job_id, om.recipient_email, om.sent_by_name,
          (select title from estimates e where e.id = om.estimate_id) as estimate_title
      `,
      [now, legacyCutoff]
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      recipientEmail: row.recipient_email,
      sentByName: row.sent_by_name,
      estimateTitle: row.estimate_title
    }));
  }

  async addTimelineEntry(entry: DeliveryTimelineEntry): Promise<void> {
    await this.database.query('update jobs set updated_at = $2 where id = $1', [
      entry.jobId,
      entry.occurredAt
    ]);
    await this.database.query(
      `
        insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), entry.jobId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
    );
  }

  async listPollable(
    checkedBefore: Date,
    sentAfter: Date,
    limit: number
  ): Promise<PollableDelivery[]> {
    const result = await this.database.query<{ id: string; provider_message_id: string }>(
      `
        select id, provider_message_id
        from outbound_messages
        where status = 'sent'
          and provider = 'relay'
          and provider_message_id is not null
          and sent_at >= $2
          and (status_checked_at is null or status_checked_at <= $1)
        order by sent_at desc
        limit $3
      `,
      [checkedBefore, sentAfter, limit]
    );
    return result.rows.map((row) => ({ id: row.id, providerMessageId: row.provider_message_id }));
  }

  async applyDeliveryState(
    id: string,
    state: 'delivered' | 'bounced' | 'complained',
    at: Date
  ): Promise<boolean> {
    // Precedence guard mirrors the relay: delivered only advances from sent;
    // bounce/complaint advance from sent or delivered.
    const result = await this.database.query(
      `
        update outbound_messages
        set status = $2,
            status_checked_at = $3,
            updated_at = $3
        where id = $1
          and (case when $2 = 'delivered' then status = 'sent' else status in ('sent', 'delivered') end)
      `,
      [id, state, at]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async touchStatusChecked(id: string, at: Date): Promise<void> {
    await this.database.query(`update outbound_messages set status_checked_at = $2 where id = $1`, [
      id,
      at
    ]);
  }
}
