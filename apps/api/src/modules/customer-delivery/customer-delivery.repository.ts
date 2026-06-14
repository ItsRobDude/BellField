import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  CreateCustomerDocumentSnapshotInput,
  CreateEstimateSendIntentResult,
  CreateOutboundMessageInput,
  CreateOutboundSendIntentResult,
  CustomerDocumentSnapshotRecord,
  OutboundMessageRecord
} from './customer-delivery.types';

type CustomerDocumentSnapshotRow = {
  id: string;
  documentType: 'estimate' | 'invoice';
  jobId: string;
  estimateId: string | null;
  invoiceId: string | null;
  sourceVersion: number;
  filename: string;
  contentType: 'application/pdf';
  storagePath: string;
  sha256: string;
  byteSize: number;
  generatedByName: string;
  generatedAt: string | Date;
};

type OutboundMessageRow = {
  id: string;
  channel: 'email';
  provider: OutboundMessageRecord['provider'];
  status: OutboundMessageRecord['status'];
  jobId: string;
  estimateId: string | null;
  invoiceId: string | null;
  documentSnapshotId: string | null;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  fromName: string | null;
  replyToEmail: string | null;
  sentByName: string;
  queuedAt: string | Date;
  sentAt: string | Date | null;
  attemptCount: number;
  nextAttemptAt: string | Date | null;
  expiresAt: string | Date | null;
  providerMessageId: string | null;
  providerError: string | null;
  acceptancePayload: OutboundMessageRecord['acceptancePayload'] | null;
  acceptanceLinkId: string | null;
  acceptanceUrl: string | null;
  acceptanceLinkExpiresAt: string | Date | null;
  acceptanceDecisionAppliedAt: string | Date | null;
};

const SNAPSHOT_COLUMNS = `
  id,
  document_type as "documentType",
  job_id as "jobId",
  estimate_id as "estimateId",
  invoice_id as "invoiceId",
  source_version as "sourceVersion",
  filename,
  content_type as "contentType",
  storage_path as "storagePath",
  sha256,
  byte_size as "byteSize",
  generated_by_name as "generatedByName",
  generated_at as "generatedAt"
`;

const OUTBOUND_COLUMNS = `
  id,
  channel,
  provider,
  status,
  job_id as "jobId",
  estimate_id as "estimateId",
  invoice_id as "invoiceId",
  document_snapshot_id as "documentSnapshotId",
  recipient_email as "recipientEmail",
  subject,
  body_text as "bodyText",
  from_name as "fromName",
  reply_to_email as "replyToEmail",
  sent_by_name as "sentByName",
  queued_at as "queuedAt",
  sent_at as "sentAt",
  attempt_count as "attemptCount",
  next_attempt_at as "nextAttemptAt",
  expires_at as "expiresAt",
  provider_message_id as "providerMessageId",
  provider_error as "providerError",
  acceptance_payload as "acceptancePayload",
  acceptance_link_id as "acceptanceLinkId",
  acceptance_url as "acceptanceUrl",
  acceptance_link_expires_at as "acceptanceLinkExpiresAt",
  acceptance_decision_applied_at as "acceptanceDecisionAppliedAt"
`;

@Injectable()
export class CustomerDeliveryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createDocumentSnapshot(
    input: CreateCustomerDocumentSnapshotInput
  ): Promise<CustomerDocumentSnapshotRecord> {
    await this.databaseService.query(
      `
        insert into customer_document_snapshots (
          id, document_type, job_id, estimate_id, invoice_id, source_version,
          filename, content_type, storage_path, sha256, byte_size,
          generated_by_employee_id, generated_by_name, generated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        input.id,
        input.documentType,
        input.jobId,
        input.estimateId ?? null,
        input.invoiceId ?? null,
        input.sourceVersion,
        input.filename,
        input.contentType,
        input.storagePath,
        input.sha256,
        input.byteSize,
        input.generatedByEmployeeId,
        input.generatedByName,
        input.generatedAt
      ]
    );
    const snapshot = await this.getDocumentSnapshotById(input.id);
    if (!snapshot) {
      throw new Error('Created customer document snapshot could not be loaded.');
    }
    return snapshot;
  }

  /**
   * Write the queued outbound row (the send intent) before any expensive
   * render or provider work. The dedupe re-check and insert run in one short
   * transaction serialized per (estimate, recipient) by an advisory lock, so
   * two concurrent sends cannot both pass the check. A live queued row blocks
   * a duplicate regardless of age (it will send or expire); a just-sent row
   * blocks only within the recency window. Legacy queued rows without an
   * expiry only block inside the recency window — the expiry sweep heals them.
   */
  async createEstimateSendIntent(
    input: CreateOutboundMessageInput & { dedupeSince: string; now: string }
  ): Promise<CreateEstimateSendIntentResult> {
    return this.createOutboundSendIntent('estimate', input);
  }

  async createInvoiceSendIntent(
    input: CreateOutboundMessageInput & { dedupeSince: string; now: string }
  ): Promise<CreateOutboundSendIntentResult> {
    return this.createOutboundSendIntent('invoice', input);
  }

  private async createOutboundSendIntent(
    documentType: 'estimate' | 'invoice',
    input: CreateOutboundMessageInput & { dedupeSince: string; now: string }
  ): Promise<CreateOutboundSendIntentResult> {
    const { dedupeSince, now, ...message } = input;
    const sourceId = documentType === 'estimate' ? message.estimateId : message.invoiceId;
    if (!sourceId) {
      throw new Error(`Missing ${documentType} id for outbound send intent.`);
    }
    const sourceColumn = documentType === 'estimate' ? 'estimate_id' : 'invoice_id';
    const blockedReason = await this.databaseService.transaction(async (queryable) => {
      await queryable.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${documentType}-email:${sourceId}:${message.recipientEmail.toLowerCase()}`
      ]);
      const blocking = await queryable.query<{ status: 'queued' | 'sent' }>(
        `
          select status
          from outbound_messages
          where ${sourceColumn} = $1
            and lower(recipient_email) = lower($2)
            and channel = 'email'
            and (
              (status = 'queued' and (expires_at > $4 or (expires_at is null and queued_at >= $3)))
              or (status = 'sent' and queued_at >= $3)
            )
          order by status asc
          limit 1
        `,
        [sourceId, message.recipientEmail, dedupeSince, now]
      );
      const row = blocking.rows[0];
      if (row) {
        return row.status === 'queued' ? ('alreadyQueued' as const) : ('recentlySent' as const);
      }
      await this.insertOutboundMessage(queryable, message);
      return null;
    });

    if (blockedReason) {
      return { kind: 'blocked', reason: blockedReason };
    }
    const record = await this.getOutboundMessageById(message.id);
    if (!record) {
      throw new Error('Created outbound message could not be loaded.');
    }
    return { kind: 'created', message: record };
  }

  /**
   * A retryable provider failure keeps the intent queued and schedules the
   * next attempt instead of failing it (relay plan §6).
   */
  async scheduleOutboundMessageRetry(
    messageId: string,
    nextAttemptAt: string,
    occurredAt: string
  ): Promise<OutboundMessageRecord> {
    await this.databaseService.query(
      `
        update outbound_messages
        set attempt_count = attempt_count + 1,
            next_attempt_at = $2,
            updated_at = $3
        where id = $1 and status = 'queued'
      `,
      [messageId, nextAttemptAt, occurredAt]
    );
    const message = await this.getOutboundMessageById(messageId);
    if (!message) {
      throw new Error('Outbound message could not be loaded after retry scheduling.');
    }
    return message;
  }

  async setOutboundMessageDocumentSnapshot(
    messageId: string,
    documentSnapshotId: string,
    updatedAt: string
  ): Promise<void> {
    await this.databaseService.query(
      `
        update outbound_messages
        set document_snapshot_id = $2,
            updated_at = $3
        where id = $1
      `,
      [messageId, documentSnapshotId, updatedAt]
    );
  }

  async markOutboundMessageSent(
    messageId: string,
    providerMessageId: string | undefined,
    sentAt: string,
    acceptance?: { linkId?: string; url?: string; expiresAt?: string }
  ): Promise<OutboundMessageRecord> {
    await this.databaseService.query(
      `
        update outbound_messages
        set status = 'sent',
            sent_at = $2,
            provider_message_id = $3,
            provider_error = null,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            acceptance_link_id = coalesce($4, acceptance_link_id),
            acceptance_url = coalesce($5, acceptance_url),
            acceptance_link_expires_at = coalesce($6, acceptance_link_expires_at),
            updated_at = $2
        where id = $1
      `,
      [
        messageId,
        sentAt,
        providerMessageId ?? null,
        acceptance?.linkId ?? null,
        acceptance?.url ?? null,
        acceptance?.expiresAt ?? null
      ]
    );
    const message = await this.getOutboundMessageById(messageId);
    if (!message) {
      throw new Error('Outbound message could not be loaded after send update.');
    }
    return message;
  }

  async markOutboundMessageFailed(
    messageId: string,
    providerError: string,
    failedAt: string
  ): Promise<OutboundMessageRecord> {
    await this.databaseService.query(
      `
        update outbound_messages
        set status = 'failed',
            provider_error = $2,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            updated_at = $3
        where id = $1
      `,
      [messageId, providerError, failedAt]
    );
    const message = await this.getOutboundMessageById(messageId);
    if (!message) {
      throw new Error('Outbound message could not be loaded after failure update.');
    }
    return message;
  }

  async listOutboundMessagesForEstimate(estimateId: string): Promise<OutboundMessageRecord[]> {
    return this.listOutboundMessagesForSource('estimate_id', estimateId);
  }

  async listOutboundMessagesForInvoice(invoiceId: string): Promise<OutboundMessageRecord[]> {
    return this.listOutboundMessagesForSource('invoice_id', invoiceId);
  }

  private async listOutboundMessagesForSource(
    sourceColumn: 'estimate_id' | 'invoice_id',
    sourceId: string
  ): Promise<OutboundMessageRecord[]> {
    const result = await this.databaseService.query<OutboundMessageRow>(
      `
        select ${OUTBOUND_COLUMNS}
        from outbound_messages
        where ${sourceColumn} = $1
        order by created_at desc, id desc
      `,
      [sourceId]
    );
    return result.rows.map(toOutboundMessageRecord);
  }

  /**
   * Cancels a queued send. Returns null when the message is no longer
   * cancelable (already sent, failed, or canceled) — the worker's own
   * transitions also guard on status='queued', so the loser of a race
   * no-ops rather than overwriting.
   */
  async cancelOutboundMessage(
    messageId: string,
    estimateId: string,
    canceledAt: string
  ): Promise<OutboundMessageRecord | null> {
    return this.cancelOutboundMessageForSource(messageId, 'estimate_id', estimateId, canceledAt);
  }

  async cancelInvoiceOutboundMessage(
    messageId: string,
    invoiceId: string,
    canceledAt: string
  ): Promise<OutboundMessageRecord | null> {
    return this.cancelOutboundMessageForSource(messageId, 'invoice_id', invoiceId, canceledAt);
  }

  private async cancelOutboundMessageForSource(
    messageId: string,
    sourceColumn: 'estimate_id' | 'invoice_id',
    sourceId: string,
    canceledAt: string
  ): Promise<OutboundMessageRecord | null> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        update outbound_messages
        set status = 'canceled',
            next_attempt_at = null,
            updated_at = $3
        where id = $1 and ${sourceColumn} = $2 and status = 'queued'
        returning id
      `,
      [messageId, sourceId, canceledAt]
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.getOutboundMessageById(messageId);
  }

  async addEstimateDeliveryTimeline(input: {
    jobId: string;
    occurredAt: string;
    actorName: string;
    kind: 'estimateSent' | 'estimateDeliveryFailed' | 'estimateSendCanceled';
    message: string;
  }): Promise<void> {
    await this.addDocumentDeliveryTimeline(input);
  }

  async addInvoiceDeliveryTimeline(input: {
    jobId: string;
    occurredAt: string;
    actorName: string;
    kind: 'invoiceSent' | 'invoiceDeliveryFailed' | 'invoiceSendCanceled';
    message: string;
  }): Promise<void> {
    await this.addDocumentDeliveryTimeline(input);
  }

  private async addDocumentDeliveryTimeline(input: {
    jobId: string;
    occurredAt: string;
    actorName: string;
    kind:
      | 'estimateSent'
      | 'estimateDeliveryFailed'
      | 'estimateSendCanceled'
      | 'invoiceSent'
      | 'invoiceDeliveryFailed'
      | 'invoiceSendCanceled';
    message: string;
  }): Promise<void> {
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query('update jobs set updated_at = $2 where id = $1', [
        input.jobId,
        input.occurredAt
      ]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: input.jobId,
          occurredAt: input.occurredAt,
          actorName: input.actorName,
          kind: input.kind,
          message: input.message
        },
        queryable
      );
    });
  }

  private async insertOutboundMessage(
    queryable: QueryExecutor,
    input: CreateOutboundMessageInput
  ): Promise<void> {
    await queryable.query(
      `
        insert into outbound_messages (
          id, channel, provider, status, job_id, estimate_id, invoice_id, document_snapshot_id,
          recipient_email, subject, body_text, from_name, reply_to_email,
          sent_by_employee_id, sent_by_name, queued_at, expires_at, acceptance_payload,
          created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $16, $16)
      `,
      [
        input.id,
        input.channel,
        input.provider,
        input.status,
        input.jobId,
        input.estimateId ?? null,
        input.invoiceId ?? null,
        input.documentSnapshotId ?? null,
        input.recipientEmail,
        input.subject,
        input.bodyText,
        input.fromName,
        input.replyToEmail ?? null,
        input.sentByEmployeeId,
        input.sentByName,
        input.queuedAt,
        input.expiresAt,
        input.acceptancePayload ? JSON.stringify(input.acceptancePayload) : null
      ]
    );
  }

  private async getDocumentSnapshotById(
    snapshotId: string
  ): Promise<CustomerDocumentSnapshotRecord | null> {
    const result = await this.databaseService.query<CustomerDocumentSnapshotRow>(
      `select ${SNAPSHOT_COLUMNS} from customer_document_snapshots where id = $1 limit 1`,
      [snapshotId]
    );
    return result.rows[0] ? toSnapshotRecord(result.rows[0]) : null;
  }

  private async getOutboundMessageById(messageId: string): Promise<OutboundMessageRecord | null> {
    const result = await this.databaseService.query<OutboundMessageRow>(
      `select ${OUTBOUND_COLUMNS} from outbound_messages where id = $1 limit 1`,
      [messageId]
    );
    return result.rows[0] ? toOutboundMessageRecord(result.rows[0]) : null;
  }
}

function toSnapshotRecord(row: CustomerDocumentSnapshotRow): CustomerDocumentSnapshotRecord {
  return {
    id: row.id,
    documentType: row.documentType,
    jobId: row.jobId,
    estimateId: row.estimateId ?? undefined,
    invoiceId: row.invoiceId ?? undefined,
    sourceVersion: row.sourceVersion,
    filename: row.filename,
    contentType: row.contentType,
    storagePath: row.storagePath,
    sha256: row.sha256,
    byteSize: row.byteSize,
    generatedByName: row.generatedByName,
    generatedAt: toIsoString(row.generatedAt)
  };
}

function toOutboundMessageRecord(row: OutboundMessageRow): OutboundMessageRecord {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    status: row.status,
    jobId: row.jobId,
    estimateId: row.estimateId ?? undefined,
    invoiceId: row.invoiceId ?? undefined,
    documentSnapshotId: row.documentSnapshotId ?? undefined,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    fromName: row.fromName ?? undefined,
    replyToEmail: row.replyToEmail ?? undefined,
    sentByName: row.sentByName,
    queuedAt: toIsoString(row.queuedAt),
    sentAt: row.sentAt ? toIsoString(row.sentAt) : undefined,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt ? toIsoString(row.nextAttemptAt) : undefined,
    expiresAt: row.expiresAt ? toIsoString(row.expiresAt) : undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    providerError: row.providerError ?? undefined,
    acceptancePayload: row.acceptancePayload ?? undefined,
    acceptanceLinkId: row.acceptanceLinkId ?? undefined,
    acceptanceUrl: row.acceptanceUrl ?? undefined,
    acceptanceLinkExpiresAt: row.acceptanceLinkExpiresAt
      ? toIsoString(row.acceptanceLinkExpiresAt)
      : undefined,
    acceptanceDecisionAppliedAt: row.acceptanceDecisionAppliedAt
      ? toIsoString(row.acceptanceDecisionAppliedAt)
      : undefined
  };
}
