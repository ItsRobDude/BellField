import { Injectable } from '@nestjs/common';
import type {
  RelayAcceptanceDeclineReason,
  RelayAcceptanceOptionInput
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import type {
  AcceptanceLinkRecord,
  AcceptanceLinksStore,
  AcceptanceLinkStoredStatus,
  AcceptanceLinkWithShop,
  ApplyDecisionInput,
  RecordAcceptanceLinkInput
} from './acceptance.types';

type AcceptanceLinkRow = {
  id: string;
  shop_id: string;
  relay_message_id: string;
  token_hash: string;
  estimate_ref: string;
  estimate_version: number;
  title: string;
  options: RelayAcceptanceOptionInput[];
  status: AcceptanceLinkStoredStatus;
  decided_option_id: string | null;
  decline_reasons: RelayAcceptanceDeclineReason[];
  homeowner_note: string | null;
  decided_at: Date | null;
  delivered_at: Date | null;
  expires_at: Date;
  created_at: Date;
};

const LINK_COLUMNS = `id, shop_id, relay_message_id, token_hash, estimate_ref, estimate_version,
  title, options, status, decided_option_id, decline_reasons, homeowner_note,
  decided_at, delivered_at, expires_at, created_at`;

@Injectable()
export class AcceptanceLinksRepository implements AcceptanceLinksStore {
  constructor(private readonly database: DatabaseService) {}

  async recordLinkSupersedingOpen(input: RecordAcceptanceLinkInput): Promise<void> {
    await this.database.transaction(async (queryable) => {
      // A resend retires the older email's link in the same transaction that
      // creates the new one, so exactly one open link exists per estimate.
      await queryable.query(
        `UPDATE relay_acceptance_links
         SET status = 'superseded'
         WHERE shop_id = $1 AND estimate_ref = $2 AND status = 'open'`,
        [input.shopId, input.estimateRef]
      );
      await queryable.query(
        `INSERT INTO relay_acceptance_links
           (id, shop_id, relay_message_id, token_hash, estimate_ref, estimate_version,
            title, options, status, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10)`,
        [
          input.id,
          input.shopId,
          input.relayMessageId,
          input.tokenHash,
          input.estimateRef,
          input.estimateVersion,
          input.title,
          JSON.stringify(input.options),
          input.expiresAt,
          input.createdAt
        ]
      );
    });
  }

  async findByTokenHash(tokenHash: string): Promise<AcceptanceLinkWithShop | null> {
    const result = await this.database.query<AcceptanceLinkRow & { shop_display_name: string }>(
      `SELECT l.id, l.shop_id, l.relay_message_id, l.token_hash, l.estimate_ref,
              l.estimate_version, l.title, l.options, l.status, l.decided_option_id,
              l.decline_reasons, l.homeowner_note, l.decided_at, l.delivered_at,
              l.expires_at, l.created_at, s.display_name AS shop_display_name
       FROM relay_acceptance_links l
       JOIN relay_shops s ON s.id = l.shop_id
       WHERE l.token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? { ...toRecord(row), shopDisplayName: row.shop_display_name } : null;
  }

  async applyDecision(input: ApplyDecisionInput): Promise<AcceptanceLinkRecord | null> {
    const result = await this.database.query<AcceptanceLinkRow>(
      `UPDATE relay_acceptance_links
       SET status = $2, decided_option_id = $3, decline_reasons = $4,
           homeowner_note = $5, decided_by_ip = $6, decided_at = $7
       WHERE token_hash = $1 AND status = 'open' AND expires_at > $7
       RETURNING ${LINK_COLUMNS}`,
      [
        input.tokenHash,
        input.decision,
        input.optionId,
        input.declineReasons,
        input.note,
        input.requesterIp,
        input.decidedAt
      ]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async listUndeliveredDecisions(shopId: string): Promise<AcceptanceLinkRecord[]> {
    const result = await this.database.query<AcceptanceLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM relay_acceptance_links
       WHERE shop_id = $1 AND decided_at IS NOT NULL AND delivered_at IS NULL
       ORDER BY decided_at ASC`,
      [shopId]
    );
    return result.rows.map(toRecord);
  }

  async acknowledgeDecision(
    shopId: string,
    acceptanceLinkId: string,
    deliveredAt: Date
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE relay_acceptance_links
       SET delivered_at = COALESCE(delivered_at, $3)
       WHERE id = $1 AND shop_id = $2 AND decided_at IS NOT NULL`,
      [acceptanceLinkId, shopId, deliveredAt]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toRecord(row: AcceptanceLinkRow): AcceptanceLinkRecord {
  return {
    id: row.id,
    shopId: row.shop_id,
    relayMessageId: row.relay_message_id,
    tokenHash: row.token_hash,
    estimateRef: row.estimate_ref,
    estimateVersion: row.estimate_version,
    title: row.title,
    options: row.options,
    status: row.status,
    decidedOptionId: row.decided_option_id,
    declineReasons: row.decline_reasons,
    homeownerNote: row.homeowner_note,
    decidedAt: row.decided_at,
    deliveredAt: row.delivered_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}
