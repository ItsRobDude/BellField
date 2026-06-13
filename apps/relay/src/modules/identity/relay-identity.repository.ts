import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import type {
  ActiveTokenWithShop,
  RelayIdentityStore,
  RelayShopRecord,
  RelayShopStatus,
  RelayTokenEventRecord,
  RelayTokenStatus,
  RelayTokenSummary
} from './relay-identity.types';

type ShopRow = {
  id: string;
  display_name: string;
  license_id: string;
  status: RelayShopStatus;
  monthly_send_quota: number;
  suspended_reason: string | null;
  update_window_end: string | null;
  payments_status: 'disabled' | 'enabled';
  stripe_connected_account_id: string | null;
  payments_enabled_at: Date | null;
  created_at: Date;
};

type ActiveTokenRow = {
  token_id: string;
  token_hash: string;
  bound_instance_id: string | null;
  last_seen_at: Date | null;
  shop_id: string;
  shop_display_name: string;
  shop_status: RelayShopStatus;
  monthly_send_quota: number;
  update_window_end: string | null;
};

type TokenSummaryRow = {
  id: string;
  status: RelayTokenStatus;
  bound_instance_id: string | null;
  bound_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
};

type TokenEventRow = {
  id: string;
  token_id: string;
  kind: RelayTokenEventRecord['kind'];
  instance_id: string | null;
  created_at: Date;
};

@Injectable()
export class RelayIdentityRepository implements RelayIdentityStore {
  constructor(private readonly database: DatabaseService) {}

  async findActiveTokenWithShop(tokenId: string): Promise<ActiveTokenWithShop | null> {
    const result = await this.database.query<ActiveTokenRow>(
      `SELECT
         t.id AS token_id,
         t.token_hash,
         t.bound_instance_id,
         t.last_seen_at,
         s.id AS shop_id,
         s.display_name AS shop_display_name,
         s.status AS shop_status,
         s.monthly_send_quota,
         s.update_window_end
       FROM relay_tokens t
       JOIN relay_shops s ON s.id = t.shop_id
       WHERE t.id = $1 AND t.status = 'active'`,
      [tokenId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      tokenId: row.token_id,
      tokenHash: row.token_hash,
      boundInstanceId: row.bound_instance_id,
      lastSeenAt: row.last_seen_at,
      shopId: row.shop_id,
      shopDisplayName: row.shop_display_name,
      shopStatus: row.shop_status,
      monthlySendQuota: row.monthly_send_quota,
      updateWindowEnd: row.update_window_end
    };
  }

  async setShopUpdateWindow(shopId: string, updateWindowEnd: string): Promise<void> {
    await this.database.query(
      `UPDATE relay_shops SET update_window_end = $2, updated_at = NOW() WHERE id = $1`,
      [shopId, updateWindowEnd]
    );
  }

  async setShopPayments(input: {
    shopId: string;
    stripeConnectedAccountId: string | null;
    enabled: boolean;
    occurredAt: Date;
  }): Promise<void> {
    await this.database.query(
      `UPDATE relay_shops
       SET stripe_connected_account_id = $2,
           payments_status = $3,
           payments_enabled_at = $4,
           updated_at = $4
       WHERE id = $1`,
      [
        input.shopId,
        input.stripeConnectedAccountId,
        input.enabled ? 'enabled' : 'disabled',
        input.enabled ? input.occurredAt : null
      ]
    );
  }

  async bindToken(input: {
    tokenId: string;
    shopId: string;
    instanceId: string;
    kind: 'bound' | 'rebound';
    occurredAt: Date;
  }): Promise<void> {
    await this.database.transaction(async (queryable) => {
      await queryable.query(
        `UPDATE relay_tokens
         SET bound_instance_id = $2, bound_at = $3, last_seen_at = $3
         WHERE id = $1`,
        [input.tokenId, input.instanceId, input.occurredAt]
      );
      await this.insertEvent(queryable, {
        shopId: input.shopId,
        tokenId: input.tokenId,
        kind: input.kind,
        instanceId: input.instanceId,
        occurredAt: input.occurredAt
      });
    });
  }

  async touchTokenLastSeen(tokenId: string, seenAt: Date): Promise<void> {
    await this.database.query(`UPDATE relay_tokens SET last_seen_at = $2 WHERE id = $1`, [
      tokenId,
      seenAt
    ]);
  }

  async countRecentRebinds(tokenId: string, since: Date): Promise<number> {
    const result = await this.database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM relay_token_events
       WHERE token_id = $1 AND kind = 'rebound' AND created_at >= $2`,
      [tokenId, since]
    );
    return result.rows[0]?.count ?? 0;
  }

  async suspendShop(input: {
    shopId: string;
    tokenId: string;
    reason: string;
    instanceId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.database.transaction(async (queryable) => {
      await queryable.query(
        `UPDATE relay_shops
         SET status = 'suspended', suspended_reason = $2, updated_at = $3
         WHERE id = $1`,
        [input.shopId, input.reason, input.occurredAt]
      );
      await this.insertEvent(queryable, {
        shopId: input.shopId,
        tokenId: input.tokenId,
        kind: 'suspended',
        instanceId: input.instanceId,
        occurredAt: input.occurredAt
      });
    });
  }

  /**
   * Lifts a suspension (flap or reputation). Returns false when the shop is
   * not suspended. If the dual-running or bounce problem persists, the same
   * detection that suspended the shop will simply suspend it again.
   */
  async reactivateShop(shopId: string, occurredAt: Date): Promise<boolean> {
    return this.database.transaction(async (queryable) => {
      const updated = await queryable.query<{ id: string }>(
        `UPDATE relay_shops
         SET status = 'active', suspended_reason = NULL, updated_at = $2
         WHERE id = $1 AND status = 'suspended'
         RETURNING id`,
        [shopId, occurredAt]
      );
      if (!updated.rows[0]) {
        return false;
      }
      const activeToken = await queryable.query<{ id: string }>(
        `SELECT id FROM relay_tokens WHERE shop_id = $1 AND status = 'active'`,
        [shopId]
      );
      if (activeToken.rows[0]) {
        await this.insertEvent(queryable, {
          shopId,
          tokenId: activeToken.rows[0].id,
          kind: 'reactivated',
          instanceId: null,
          occurredAt
        });
      }
      return true;
    });
  }

  async findActiveTokenIdForShop(shopId: string): Promise<string | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM relay_tokens WHERE shop_id = $1 AND status = 'active'`,
      [shopId]
    );
    return result.rows[0]?.id ?? null;
  }

  async createShop(input: {
    id: string;
    displayName: string;
    licenseId: string;
    monthlySendQuota: number;
    createdAt: Date;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO relay_shops (id, display_name, license_id, status, monthly_send_quota, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $5)`,
      [input.id, input.displayName, input.licenseId, input.monthlySendQuota, input.createdAt]
    );
  }

  async findShopById(shopId: string): Promise<RelayShopRecord | null> {
    const result = await this.database.query<ShopRow>(
      `SELECT id, display_name, license_id, status, monthly_send_quota, suspended_reason,
              update_window_end, payments_status, stripe_connected_account_id,
              payments_enabled_at, created_at
       FROM relay_shops
       WHERE id = $1`,
      [shopId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      displayName: row.display_name,
      licenseId: row.license_id,
      status: row.status,
      monthlySendQuota: row.monthly_send_quota,
      suspendedReason: row.suspended_reason,
      updateWindowEnd: row.update_window_end,
      paymentsStatus: row.payments_status,
      stripeConnectedAccountId: row.stripe_connected_account_id,
      paymentsEnabledAt: row.payments_enabled_at,
      createdAt: row.created_at
    };
  }

  /**
   * Issues a new token for the shop, atomically revoking any prior active
   * token — at most one active token per shop, enforced here and by the
   * partial unique index.
   */
  async issueToken(input: {
    shopId: string;
    tokenId: string;
    tokenHash: string;
    issuedAt: Date;
  }): Promise<{ revokedTokenId: string | null }> {
    return this.database.transaction(async (queryable) => {
      const revoked = await queryable.query<{ id: string }>(
        `UPDATE relay_tokens
         SET status = 'revoked', revoked_at = $2
         WHERE shop_id = $1 AND status = 'active'
         RETURNING id`,
        [input.shopId, input.issuedAt]
      );
      const revokedTokenId = revoked.rows[0]?.id ?? null;
      if (revokedTokenId) {
        await this.insertEvent(queryable, {
          shopId: input.shopId,
          tokenId: revokedTokenId,
          kind: 'revoked',
          instanceId: null,
          occurredAt: input.issuedAt
        });
      }
      await queryable.query(
        `INSERT INTO relay_tokens (id, shop_id, token_hash, status, created_at)
         VALUES ($1, $2, $3, 'active', $4)`,
        [input.tokenId, input.shopId, input.tokenHash, input.issuedAt]
      );
      await this.insertEvent(queryable, {
        shopId: input.shopId,
        tokenId: input.tokenId,
        kind: 'issued',
        instanceId: null,
        occurredAt: input.issuedAt
      });
      return { revokedTokenId };
    });
  }

  async revokeActiveToken(input: {
    shopId: string;
    revokedAt: Date;
  }): Promise<{ revokedTokenId: string | null }> {
    return this.database.transaction(async (queryable) => {
      const revoked = await queryable.query<{ id: string }>(
        `UPDATE relay_tokens
         SET status = 'revoked', revoked_at = $2
         WHERE shop_id = $1 AND status = 'active'
         RETURNING id`,
        [input.shopId, input.revokedAt]
      );
      const revokedTokenId = revoked.rows[0]?.id ?? null;
      if (revokedTokenId) {
        await this.insertEvent(queryable, {
          shopId: input.shopId,
          tokenId: revokedTokenId,
          kind: 'revoked',
          instanceId: null,
          occurredAt: input.revokedAt
        });
      }
      return { revokedTokenId };
    });
  }

  async listTokensForShop(shopId: string): Promise<RelayTokenSummary[]> {
    const result = await this.database.query<TokenSummaryRow>(
      `SELECT id, status, bound_instance_id, bound_at, last_seen_at, created_at, revoked_at
       FROM relay_tokens
       WHERE shop_id = $1
       ORDER BY created_at DESC`,
      [shopId]
    );
    return result.rows.map((row) => ({
      tokenId: row.id,
      status: row.status,
      boundInstanceId: row.bound_instance_id,
      boundAt: row.bound_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    }));
  }

  async listRecentEvents(shopId: string, limit: number): Promise<RelayTokenEventRecord[]> {
    const result = await this.database.query<TokenEventRow>(
      `SELECT id, token_id, kind, instance_id, created_at
       FROM relay_token_events
       WHERE shop_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [shopId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tokenId: row.token_id,
      kind: row.kind,
      instanceId: row.instance_id,
      createdAt: row.created_at
    }));
  }

  private async insertEvent(
    queryable: QueryExecutor,
    input: {
      shopId: string;
      tokenId: string;
      kind: RelayTokenEventRecord['kind'];
      instanceId: string | null;
      occurredAt: Date;
    }
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO relay_token_events (id, shop_id, token_id, kind, instance_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), input.shopId, input.tokenId, input.kind, input.instanceId, input.occurredAt]
    );
  }
}
