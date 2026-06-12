import { RelayAuthService } from './relay-auth.service';
import { generateRelayToken } from './relay-token.util';
import type {
  ActiveTokenWithShop,
  RelayIdentityStore,
  RelayShopStatus
} from './relay-identity.types';

type StoredShop = {
  id: string;
  displayName: string;
  status: RelayShopStatus;
  monthlySendQuota: number;
  suspendedReason: string | null;
  updateWindowEnd?: string | null;
};

type StoredToken = {
  tokenId: string;
  tokenHash: string;
  shopId: string;
  status: 'active' | 'revoked';
  boundInstanceId: string | null;
  lastSeenAt: Date | null;
};

type StoredEvent = {
  tokenId: string;
  kind: 'issued' | 'revoked' | 'bound' | 'rebound' | 'suspended';
  instanceId: string | null;
  createdAt: Date;
};

class InMemoryIdentityStore implements RelayIdentityStore {
  shops = new Map<string, StoredShop>();
  tokens = new Map<string, StoredToken>();
  events: StoredEvent[] = [];

  async findActiveTokenWithShop(tokenId: string): Promise<ActiveTokenWithShop | null> {
    const token = this.tokens.get(tokenId);
    if (!token || token.status !== 'active') {
      return null;
    }
    const shop = this.shops.get(token.shopId);
    if (!shop) {
      return null;
    }
    return {
      tokenId: token.tokenId,
      tokenHash: token.tokenHash,
      boundInstanceId: token.boundInstanceId,
      lastSeenAt: token.lastSeenAt,
      shopId: shop.id,
      shopDisplayName: shop.displayName,
      shopStatus: shop.status,
      monthlySendQuota: shop.monthlySendQuota,
      updateWindowEnd: shop.updateWindowEnd ?? null
    };
  }

  async bindToken(input: {
    tokenId: string;
    shopId: string;
    instanceId: string;
    kind: 'bound' | 'rebound';
    occurredAt: Date;
  }): Promise<void> {
    const token = this.tokens.get(input.tokenId);
    if (!token) {
      throw new Error('Token missing in test store.');
    }
    token.boundInstanceId = input.instanceId;
    token.lastSeenAt = input.occurredAt;
    this.events.push({
      tokenId: input.tokenId,
      kind: input.kind,
      instanceId: input.instanceId,
      createdAt: input.occurredAt
    });
  }

  async touchTokenLastSeen(tokenId: string, seenAt: Date): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token) {
      token.lastSeenAt = seenAt;
    }
  }

  async countRecentRebinds(tokenId: string, since: Date): Promise<number> {
    return this.events.filter(
      (event) => event.tokenId === tokenId && event.kind === 'rebound' && event.createdAt >= since
    ).length;
  }

  async suspendShop(input: {
    shopId: string;
    tokenId: string;
    reason: string;
    instanceId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    const shop = this.shops.get(input.shopId);
    if (shop) {
      shop.status = 'suspended';
      shop.suspendedReason = input.reason;
    }
    this.events.push({
      tokenId: input.tokenId,
      kind: 'suspended',
      instanceId: input.instanceId,
      createdAt: input.occurredAt
    });
  }
}

function setup(options?: { flapThreshold?: number; flapWindowMinutes?: number }) {
  const store = new InMemoryIdentityStore();
  const generated = generateRelayToken();
  store.shops.set('shop_1', {
    id: 'shop_1',
    displayName: 'Acme HVAC',
    status: 'active',
    monthlySendQuota: 500,
    suspendedReason: null
  });
  store.tokens.set(generated.tokenId, {
    tokenId: generated.tokenId,
    tokenHash: generated.tokenHash,
    shopId: 'shop_1',
    status: 'active',
    boundInstanceId: null,
    lastSeenAt: null
  });
  let currentTime = new Date('2026-06-11T12:00:00.000Z');
  const service = new RelayAuthService(store, {
    rebindFlapThreshold: options?.flapThreshold ?? 3,
    rebindFlapWindowMinutes: options?.flapWindowMinutes ?? 60,
    now: () => currentTime
  });
  return {
    store,
    service,
    token: generated.token,
    tokenId: generated.tokenId,
    advance(ms: number) {
      currentTime = new Date(currentTime.getTime() + ms);
    }
  };
}

describe('RelayAuthService', () => {
  it('authenticates and binds on first use', async () => {
    const { service, store, token, tokenId } = setup();

    const result = await service.authenticate(token, 'instance-a');

    expect(result.outcome).toBe('authenticated');
    if (result.outcome === 'authenticated') {
      expect(result.shop).toMatchObject({
        shopId: 'shop_1',
        displayName: 'Acme HVAC',
        monthlySendQuota: 500,
        tokenId,
        instanceId: 'instance-a'
      });
    }
    expect(store.tokens.get(tokenId)?.boundInstanceId).toBe('instance-a');
    expect(store.events).toEqual([
      expect.objectContaining({ kind: 'bound', instanceId: 'instance-a' })
    ]);
  });

  it('does not rebind when the same instance returns', async () => {
    const { service, store, token } = setup();

    await service.authenticate(token, 'instance-a');
    await service.authenticate(token, 'instance-a');

    expect(store.events.filter((event) => event.kind === 'rebound')).toHaveLength(0);
  });

  it('rebinds automatically when a replacement server presents the token', async () => {
    const { service, store, token, tokenId } = setup();

    await service.authenticate(token, 'instance-a');
    const result = await service.authenticate(token, 'instance-b');

    expect(result.outcome).toBe('authenticated');
    expect(store.tokens.get(tokenId)?.boundInstanceId).toBe('instance-b');
    expect(store.events.filter((event) => event.kind === 'rebound')).toHaveLength(1);
  });

  it('suspends the shop when rebinds flap past the threshold', async () => {
    const { service, store, token, advance } = setup({ flapThreshold: 3 });

    await service.authenticate(token, 'instance-a');
    advance(1_000);
    await service.authenticate(token, 'instance-b');
    advance(1_000);
    await service.authenticate(token, 'instance-a');
    advance(1_000);
    const result = await service.authenticate(token, 'instance-b');

    expect(result.outcome).toBe('suspended');
    expect(store.shops.get('shop_1')?.status).toBe('suspended');
    expect(store.shops.get('shop_1')?.suspendedReason).toBe('activation-flapping');
    expect(store.events.filter((event) => event.kind === 'suspended')).toHaveLength(1);
  });

  it('does not count rebinds outside the flap window', async () => {
    const { service, store, token, advance } = setup({ flapThreshold: 2, flapWindowMinutes: 60 });

    await service.authenticate(token, 'instance-a');
    advance(1_000);
    await service.authenticate(token, 'instance-b');
    advance(61 * 60_000);
    const result = await service.authenticate(token, 'instance-a');

    expect(result.outcome).toBe('authenticated');
    expect(store.shops.get('shop_1')?.status).toBe('active');
  });

  it('rejects a suspended shop', async () => {
    const { service, store, token } = setup();
    const shop = store.shops.get('shop_1');
    if (shop) {
      shop.status = 'suspended';
      shop.suspendedReason = 'manual';
    }

    const result = await service.authenticate(token, 'instance-a');

    expect(result.outcome).toBe('suspended');
  });

  it('rejects an unknown token id', async () => {
    const { service } = setup();
    const other = generateRelayToken();

    const result = await service.authenticate(other.token, 'instance-a');

    expect(result.outcome).toBe('unauthorized');
  });

  it('rejects a token whose secret does not match the stored hash', async () => {
    const { service, store, tokenId } = setup();
    const forged = `bfrt1_${tokenId}_${'a'.repeat(64)}`;

    const result = await service.authenticate(forged, 'instance-a');

    expect(result.outcome).toBe('unauthorized');
    expect(store.events).toHaveLength(0);
  });

  it('rejects a revoked token', async () => {
    const { service, store, token, tokenId } = setup();
    const stored = store.tokens.get(tokenId);
    if (stored) {
      stored.status = 'revoked';
    }

    const result = await service.authenticate(token, 'instance-a');

    expect(result.outcome).toBe('unauthorized');
  });

  it('rejects requests missing the token or the instance header', async () => {
    const { service, token } = setup();

    expect((await service.authenticate(undefined, 'instance-a')).outcome).toBe('unauthorized');
    expect((await service.authenticate(token, undefined)).outcome).toBe('unauthorized');
    expect((await service.authenticate(token, '   ')).outcome).toBe('unauthorized');
  });

  it('rejects malformed bearer values', async () => {
    const { service } = setup();

    expect((await service.authenticate('not-a-token', 'instance-a')).outcome).toBe('unauthorized');
  });
});

describe('RelayAuthService.verifyToken', () => {
  it('identifies the shop without binding or recording any event', async () => {
    const { service, store, token } = setup();
    const shop = store.shops.get('shop_1');
    if (shop) {
      shop.updateWindowEnd = '2027-06-11';
    }

    const result = await service.verifyToken(token);

    expect(result.outcome).toBe('identified');
    if (result.outcome === 'identified') {
      expect(result.shop).toEqual({
        shopId: 'shop_1',
        displayName: 'Acme HVAC',
        updateWindowEnd: '2027-06-11'
      });
    }
    // The whole point: no bind, no rebind, no flap input.
    expect(store.events).toHaveLength(0);
    expect(store.tokens.values().next().value?.boundInstanceId).toBeNull();
  });

  it('does not move an existing binding', async () => {
    const { service, store, token, tokenId } = setup();
    await service.authenticate(token, 'instance-a');

    await service.verifyToken(token);

    expect(store.tokens.get(tokenId)?.boundInstanceId).toBe('instance-a');
    expect(store.events.filter((event) => event.kind === 'rebound')).toHaveLength(0);
  });

  it('rejects unknown, forged, and missing tokens', async () => {
    const { service, tokenId } = setup();
    const forged = `bfrt1_${tokenId}_${'a'.repeat(64)}`;

    expect((await service.verifyToken(undefined)).outcome).toBe('unauthorized');
    expect((await service.verifyToken('garbage')).outcome).toBe('unauthorized');
    expect((await service.verifyToken(forged)).outcome).toBe('unauthorized');
  });

  it('rejects a suspended shop', async () => {
    const { service, store, token } = setup();
    const shop = store.shops.get('shop_1');
    if (shop) {
      shop.status = 'suspended';
      shop.suspendedReason = 'manual';
    }

    expect((await service.verifyToken(token)).outcome).toBe('suspended');
  });
});
