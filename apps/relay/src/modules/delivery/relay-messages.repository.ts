import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type {
  RelayMessageRecord,
  RelayMessagesStore,
  RelayMessageStatus,
  ShopReputationCounts,
  SuppressionReason
} from './relay-delivery.types';

type MessageRow = {
  id: string;
  shop_id: string;
  idempotency_key: string;
  recipient_email: string;
  subject: string;
  status: RelayMessageStatus;
  failure_code: string | null;
  provider_message_id: string | null;
  accepted_at: Date;
  updated_at: Date;
};

const MESSAGE_COLUMNS = `id, shop_id, idempotency_key, recipient_email, subject, status,
  failure_code, provider_message_id, accepted_at, updated_at`;

@Injectable()
export class RelayMessagesRepository implements RelayMessagesStore {
  constructor(private readonly database: DatabaseService) {}

  async withIdempotencyLock<T>(
    shopId: string,
    idempotencyKey: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return await this.database.transaction(async (queryable) => {
      await queryable.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
        `relay-send:${shopId}:${idempotencyKey}`
      ]);
      return await callback();
    });
  }

  async findByIdempotencyKey(
    shopId: string,
    idempotencyKey: string
  ): Promise<RelayMessageRecord | null> {
    const result = await this.database.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM relay_messages
       WHERE shop_id = $1 AND idempotency_key = $2`,
      [shopId, idempotencyKey]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async findByIdForShop(messageId: string, shopId: string): Promise<RelayMessageRecord | null> {
    const result = await this.database.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM relay_messages
       WHERE id = $1 AND shop_id = $2`,
      [messageId, shopId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async findByProviderMessageId(providerMessageId: string): Promise<RelayMessageRecord | null> {
    const result = await this.database.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM relay_messages
       WHERE provider_message_id = $1`,
      [providerMessageId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async recordOutcome(input: {
    id: string;
    shopId: string;
    idempotencyKey: string;
    recipientEmail: string;
    subject: string;
    status: 'sent' | 'failed';
    failureCode: string | null;
    providerMessageId: string | null;
    acceptedAt: Date;
  }): Promise<RelayMessageRecord> {
    // The send service normally serializes duplicate submits with an advisory
    // lock. The unique index remains the final integrity guard if a caller ever
    // bypasses that path.
    const inserted = await this.database.query<MessageRow>(
      `INSERT INTO relay_messages
         (id, shop_id, idempotency_key, recipient_email, subject, status,
          failure_code, provider_message_id, accepted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (shop_id, idempotency_key) DO NOTHING
       RETURNING ${MESSAGE_COLUMNS}`,
      [
        input.id,
        input.shopId,
        input.idempotencyKey,
        input.recipientEmail,
        input.subject,
        input.status,
        input.failureCode,
        input.providerMessageId,
        input.acceptedAt
      ]
    );
    if (inserted.rows[0]) {
      return toRecord(inserted.rows[0]);
    }
    const existing = await this.findByIdempotencyKey(input.shopId, input.idempotencyKey);
    if (!existing) {
      throw new Error('Relay message insert conflicted but no recorded row was found.');
    }
    return existing;
  }

  async applyDeliveryEvent(input: {
    providerMessageId: string;
    status: 'delivered' | 'bounced' | 'complained';
    occurredAt: Date;
  }): Promise<boolean> {
    // Precedence guard: delivered only advances from sent; bounce/complaint
    // advance from sent or delivered. Late events never resurrect failures.
    const allowedFrom = input.status === 'delivered' ? ['sent'] : ['sent', 'delivered'];
    const result = await this.database.query(
      `UPDATE relay_messages
       SET status = $2, updated_at = $3
       WHERE provider_message_id = $1 AND status = ANY($4)`,
      [input.providerMessageId, input.status, input.occurredAt, allowedFrom]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countSendsSince(shopId: string, since: Date): Promise<number> {
    const result = await this.database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM relay_messages
       WHERE shop_id = $1 AND accepted_at >= $2 AND status <> 'failed'`,
      [shopId, since]
    );
    return result.rows[0]?.count ?? 0;
  }

  async isRecipientSuppressed(shopId: string, email: string): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM relay_suppressions
       WHERE shop_id = $1 AND lower(email) = lower($2)
       LIMIT 1`,
      [shopId, email]
    );
    return result.rows.length > 0;
  }

  async addSuppression(input: {
    shopId: string;
    email: string;
    reason: SuppressionReason;
    occurredAt: Date;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO relay_suppressions (id, shop_id, email, reason, created_at)
       VALUES ($1, $2, lower($3), $4, $5)
       ON CONFLICT (shop_id, lower(email)) DO NOTHING`,
      [randomUUID(), input.shopId, input.email, input.reason, input.occurredAt]
    );
  }

  async getReputationCounts(shopId: string, since: Date): Promise<ShopReputationCounts> {
    const result = await this.database.query<{ attempted: number; hard_failures: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'failed')::int AS attempted,
         COUNT(*) FILTER (WHERE status IN ('bounced', 'complained'))::int AS hard_failures
       FROM relay_messages
       WHERE shop_id = $1 AND accepted_at >= $2`,
      [shopId, since]
    );
    const row = result.rows[0];
    return {
      attempted: row?.attempted ?? 0,
      hardFailures: row?.hard_failures ?? 0
    };
  }
}

function toRecord(row: MessageRow): RelayMessageRecord {
  return {
    id: row.id,
    shopId: row.shop_id,
    idempotencyKey: row.idempotency_key,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    status: row.status,
    failureCode: row.failure_code,
    providerMessageId: row.provider_message_id,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at
  };
}
