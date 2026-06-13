import { ProviderWebhookService, type ShopSuspender } from './provider-webhook.service';
import type {
  RelayMessageRecord,
  RelayMessagesStore,
  ShopReputationCounts,
  SuppressionReason
} from './relay-delivery.types';

function makeMessage(overrides?: Partial<RelayMessageRecord>): RelayMessageRecord {
  return {
    id: 'relay-msg-1',
    shopId: 'shop_1',
    idempotencyKey: 'key-1',
    recipientEmail: 'homeowner@example.com',
    subject: 'Your estimate',
    status: 'sent',
    failureCode: null,
    providerMessageId: 'prov-1',
    acceptedAt: new Date('2026-06-11T12:00:00Z'),
    updatedAt: new Date('2026-06-11T12:00:00Z'),
    ...overrides
  };
}

class StubStore implements RelayMessagesStore {
  message: RelayMessageRecord | null = makeMessage();
  suppressions: { shopId: string; email: string; reason: SuppressionReason }[] = [];
  reputation: ShopReputationCounts = { attempted: 0, hardFailures: 0 };
  appliedEvents: { providerMessageId: string; status: string }[] = [];

  async withIdempotencyLock<T>(
    _shopId: string,
    _idempotencyKey: string,
    callback: () => Promise<T>
  ) {
    return await callback();
  }

  async findByIdempotencyKey() {
    return null;
  }

  async findByIdForShop() {
    return this.message;
  }

  async findByProviderMessageId(providerMessageId: string) {
    return this.message?.providerMessageId === providerMessageId ? this.message : null;
  }

  async recordOutcome(): Promise<RelayMessageRecord> {
    throw new Error('not used');
  }

  async applyDeliveryEvent(input: {
    providerMessageId: string;
    status: 'delivered' | 'bounced' | 'complained';
    occurredAt: Date;
  }) {
    if (this.message?.providerMessageId !== input.providerMessageId) {
      return false;
    }
    const allowedFrom = input.status === 'delivered' ? ['sent'] : ['sent', 'delivered'];
    if (!allowedFrom.includes(this.message.status)) {
      return false;
    }
    this.message = { ...this.message, status: input.status };
    this.appliedEvents.push({ providerMessageId: input.providerMessageId, status: input.status });
    return true;
  }

  async countSendsSince() {
    return 0;
  }

  async isRecipientSuppressed() {
    return false;
  }

  async addSuppression(input: {
    shopId: string;
    email: string;
    reason: SuppressionReason;
    occurredAt: Date;
  }) {
    this.suppressions.push({ shopId: input.shopId, email: input.email, reason: input.reason });
  }

  async getReputationCounts() {
    return this.reputation;
  }
}

class StubSuspender implements ShopSuspender {
  suspensions: { shopId: string; reason: string }[] = [];
  activeTokenId: string | null = 'token_1';

  async findActiveTokenIdForShop() {
    return this.activeTokenId;
  }

  async suspendShop(input: { shopId: string; reason: string }) {
    this.suspensions.push({ shopId: input.shopId, reason: input.reason });
  }
}

function setup() {
  const store = new StubStore();
  const suspender = new StubSuspender();
  const service = new ProviderWebhookService(
    store,
    suspender,
    () => new Date('2026-06-11T13:00:00Z')
  );
  return { store, suspender, service };
}

describe('ProviderWebhookService', () => {
  it('marks a message delivered', async () => {
    const { store, service } = setup();

    await service.handleEvent({ type: 'email.delivered', data: { email_id: 'prov-1' } });

    expect(store.message?.status).toBe('delivered');
    expect(store.suppressions).toHaveLength(0);
  });

  it('marks a bounce, suppresses the recipient, and checks reputation', async () => {
    const { store, service } = setup();

    await service.handleEvent({ type: 'email.bounced', data: { email_id: 'prov-1' } });

    expect(store.message?.status).toBe('bounced');
    expect(store.suppressions).toEqual([
      { shopId: 'shop_1', email: 'homeowner@example.com', reason: 'bounce' }
    ]);
  });

  it('marks a complaint and suppresses the recipient', async () => {
    const { store, service } = setup();

    await service.handleEvent({ type: 'email.complained', data: { email_id: 'prov-1' } });

    expect(store.message?.status).toBe('complained');
    expect(store.suppressions[0]?.reason).toBe('complaint');
  });

  it('suspends the shop when the hard-failure rate crosses the threshold', async () => {
    const { store, suspender, service } = setup();
    store.reputation = { attempted: 40, hardFailures: 3 };

    await service.handleEvent({ type: 'email.bounced', data: { email_id: 'prov-1' } });

    expect(suspender.suspensions).toEqual([{ shopId: 'shop_1', reason: 'delivery-reputation' }]);
  });

  it('does not suspend below the minimum send volume', async () => {
    const { store, suspender, service } = setup();
    store.reputation = { attempted: 10, hardFailures: 10 };

    await service.handleEvent({ type: 'email.bounced', data: { email_id: 'prov-1' } });

    expect(suspender.suspensions).toHaveLength(0);
  });

  it('ignores unknown event types and unknown message ids', async () => {
    const { store, service } = setup();

    await service.handleEvent({ type: 'email.opened', data: { email_id: 'prov-1' } });
    await service.handleEvent({ type: 'email.bounced', data: { email_id: 'prov-unknown' } });
    await service.handleEvent({ type: 'email.bounced' });

    expect(store.message?.status).toBe('sent');
    expect(store.suppressions).toHaveLength(0);
  });

  it('does not double-apply out-of-order delivered after bounce', async () => {
    const { store, service } = setup();

    await service.handleEvent({ type: 'email.bounced', data: { email_id: 'prov-1' } });
    await service.handleEvent({ type: 'email.delivered', data: { email_id: 'prov-1' } });

    expect(store.message?.status).toBe('bounced');
    expect(store.suppressions).toHaveLength(1);
  });
});
