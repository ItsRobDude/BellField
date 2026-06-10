import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  CreateCustomerDocumentSnapshotInput,
  CreateOutboundMessageInput,
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
  provider: 'resend';
  status: OutboundMessageRecord['status'];
  jobId: string;
  estimateId: string | null;
  invoiceId: string | null;
  documentSnapshotId: string | null;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  sentByName: string;
  queuedAt: string | Date;
  sentAt: string | Date | null;
  providerMessageId: string | null;
  providerError: string | null;
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
  sent_by_name as "sentByName",
  queued_at as "queuedAt",
  sent_at as "sentAt",
  provider_message_id as "providerMessageId",
  provider_error as "providerError"
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
   * render or provider work. The recency re-check and insert run in one short
   * transaction serialized per (estimate, recipient) by an advisory lock, so
   * two concurrent sends cannot both pass the dedupe window. Returns null when
   * a recent queued/sent message already covers this send.
   */
  async createEstimateSendIntent(
    input: CreateOutboundMessageInput & { dedupeSince: string }
  ): Promise<OutboundMessageRecord | null> {
    const { dedupeSince, ...message } = input;
    const inserted = await this.databaseService.transaction(async (queryable) => {
      await queryable.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `estimate-email:${message.estimateId}:${message.recipientEmail.toLowerCase()}`
      ]);
      const recent = await queryable.query<{ id: string }>(
        `
          select id
          from outbound_messages
          where estimate_id = $1
            and lower(recipient_email) = lower($2)
            and channel = 'email'
            and status in ('queued', 'sent')
            and queued_at >= $3
          limit 1
        `,
        [message.estimateId, message.recipientEmail, dedupeSince]
      );
      if (recent.rows[0]) {
        return false;
      }
      await this.insertOutboundMessage(queryable, message);
      return true;
    });

    if (!inserted) {
      return null;
    }
    const record = await this.getOutboundMessageById(message.id);
    if (!record) {
      throw new Error('Created outbound message could not be loaded.');
    }
    return record;
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
    sentAt: string
  ): Promise<OutboundMessageRecord> {
    await this.databaseService.query(
      `
        update outbound_messages
        set status = 'sent',
            sent_at = $2,
            provider_message_id = $3,
            provider_error = null,
            updated_at = $2
        where id = $1
      `,
      [messageId, sentAt, providerMessageId ?? null]
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
    const result = await this.databaseService.query<OutboundMessageRow>(
      `
        select ${OUTBOUND_COLUMNS}
        from outbound_messages
        where estimate_id = $1
        order by created_at desc, id desc
      `,
      [estimateId]
    );
    return result.rows.map(toOutboundMessageRecord);
  }

  async addEstimateDeliveryTimeline(input: {
    jobId: string;
    occurredAt: string;
    actorName: string;
    kind: 'estimateSent' | 'estimateDeliveryFailed';
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
          recipient_email, subject, body_text, sent_by_employee_id, sent_by_name, queued_at,
          created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $14)
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
        input.sentByEmployeeId,
        input.sentByName,
        input.queuedAt
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
    sentByName: row.sentByName,
    queuedAt: toIsoString(row.queuedAt),
    sentAt: row.sentAt ? toIsoString(row.sentAt) : undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    providerError: row.providerError ?? undefined
  };
}
