export type RelayShopStatus = 'active' | 'suspended';
export type RelayTokenStatus = 'active' | 'revoked';
export type RelayTokenEventKind = 'issued' | 'revoked' | 'bound' | 'rebound' | 'suspended';

export type RelayShopRecord = {
  id: string;
  displayName: string;
  licenseId: string;
  status: RelayShopStatus;
  monthlySendQuota: number;
  suspendedReason: string | null;
  createdAt: Date;
};

export type ActiveTokenWithShop = {
  tokenId: string;
  tokenHash: string;
  boundInstanceId: string | null;
  lastSeenAt: Date | null;
  shopId: string;
  shopDisplayName: string;
  shopStatus: RelayShopStatus;
  monthlySendQuota: number;
};

export type RelayTokenSummary = {
  tokenId: string;
  status: RelayTokenStatus;
  boundInstanceId: string | null;
  boundAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export type RelayTokenEventRecord = {
  id: string;
  tokenId: string;
  kind: RelayTokenEventKind;
  instanceId: string | null;
  createdAt: Date;
};

/** The identity attached to an authenticated relay request. */
export type AuthenticatedRelayShop = {
  shopId: string;
  displayName: string;
  monthlySendQuota: number;
  tokenId: string;
  instanceId: string;
};

export interface RelayIdentityStore {
  findActiveTokenWithShop(tokenId: string): Promise<ActiveTokenWithShop | null>;
  bindToken(input: {
    tokenId: string;
    shopId: string;
    instanceId: string;
    kind: 'bound' | 'rebound';
    occurredAt: Date;
  }): Promise<void>;
  touchTokenLastSeen(tokenId: string, seenAt: Date): Promise<void>;
  countRecentRebinds(tokenId: string, since: Date): Promise<number>;
  suspendShop(input: {
    shopId: string;
    tokenId: string;
    reason: string;
    instanceId: string | null;
    occurredAt: Date;
  }): Promise<void>;
}
