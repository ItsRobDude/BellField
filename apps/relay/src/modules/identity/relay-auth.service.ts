import { Inject, Injectable, Optional } from '@nestjs/common';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { log } from '../../common/logger';
import { RelayIdentityRepository } from './relay-identity.repository';
import { parseRelayToken, relayTokenHashMatches } from './relay-token.util';
import type { AuthenticatedRelayShop, RelayIdentityStore } from './relay-identity.types';

export const RELAY_IDENTITY_STORE = 'RELAY_IDENTITY_STORE';

const LAST_SEEN_REFRESH_MS = 60_000;
const FLAP_SUSPENSION_REASON = 'activation-flapping';

export type RelayAuthResult =
  | { outcome: 'authenticated'; shop: AuthenticatedRelayShop }
  | { outcome: 'unauthorized' }
  | { outcome: 'suspended' };

type RelayAuthOptions = {
  rebindFlapThreshold?: number;
  rebindFlapWindowMinutes?: number;
  now?: () => Date;
};

@Injectable()
export class RelayAuthService {
  private readonly rebindFlapThreshold: number;
  private readonly rebindFlapWindowMinutes: number;
  private readonly now: () => Date;

  constructor(
    @Inject(RELAY_IDENTITY_STORE) private readonly identityStore: RelayIdentityStore,
    @Optional() options?: RelayAuthOptions
  ) {
    const config = options ?? getRelayRuntimeConfig();
    this.rebindFlapThreshold = config.rebindFlapThreshold ?? 5;
    this.rebindFlapWindowMinutes = config.rebindFlapWindowMinutes ?? 60;
    this.now = options?.now ?? (() => new Date());
  }

  /**
   * Authenticates a relay request per docs/relay-token-design.md: bearer token
   * lookup + constant-time hash compare, then single-active binding with
   * automatic rebind and flap-detection suspension.
   */
  async authenticate(
    bearerToken: string | undefined,
    instanceId: string | undefined
  ): Promise<RelayAuthResult> {
    if (!bearerToken || !instanceId || !instanceId.trim()) {
      return { outcome: 'unauthorized' };
    }

    const parsed = parseRelayToken(bearerToken);
    if (!parsed) {
      return { outcome: 'unauthorized' };
    }

    const record = await this.identityStore.findActiveTokenWithShop(parsed.tokenId);
    if (!record || !relayTokenHashMatches(bearerToken, record.tokenHash)) {
      return { outcome: 'unauthorized' };
    }

    if (record.shopStatus === 'suspended') {
      return { outcome: 'suspended' };
    }

    const now = this.now();
    if (record.boundInstanceId === null) {
      await this.identityStore.bindToken({
        tokenId: record.tokenId,
        shopId: record.shopId,
        instanceId,
        kind: 'bound',
        occurredAt: now
      });
    } else if (record.boundInstanceId !== instanceId) {
      // Activation moves automatically so a dead-server replacement needs no
      // support ticket; two live servers sharing a token rebind constantly,
      // which the flap check below turns into a loud suspension.
      await this.identityStore.bindToken({
        tokenId: record.tokenId,
        shopId: record.shopId,
        instanceId,
        kind: 'rebound',
        occurredAt: now
      });
      const windowStart = new Date(now.getTime() - this.rebindFlapWindowMinutes * 60_000);
      const recentRebinds = await this.identityStore.countRecentRebinds(
        record.tokenId,
        windowStart
      );
      if (recentRebinds >= this.rebindFlapThreshold) {
        await this.identityStore.suspendShop({
          shopId: record.shopId,
          tokenId: record.tokenId,
          reason: FLAP_SUSPENSION_REASON,
          instanceId,
          occurredAt: now
        });
        log('warn', 'Relay shop suspended for activation flapping.', {
          shopId: record.shopId,
          recentRebinds
        });
        return { outcome: 'suspended' };
      }
    } else if (
      !record.lastSeenAt ||
      now.getTime() - record.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS
    ) {
      await this.identityStore.touchTokenLastSeen(record.tokenId, now);
    }

    return {
      outcome: 'authenticated',
      shop: {
        shopId: record.shopId,
        displayName: record.shopDisplayName,
        monthlySendQuota: record.monthlySendQuota,
        tokenId: record.tokenId,
        instanceId
      }
    };
  }
}

export const relayIdentityStoreProvider = {
  provide: RELAY_IDENTITY_STORE,
  useExisting: RelayIdentityRepository
};
