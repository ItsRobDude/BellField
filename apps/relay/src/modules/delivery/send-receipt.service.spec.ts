import { SendReceiptService, type SendReceiptMessageInput } from './send-receipt.service';
import type {
  EmailSendAdapter,
  ProviderSendInput,
  ProviderSendResult,
  RelayMessageRecord,
  RelayMessagesStore,
  ShopReputationCounts,
  SuppressionReason
} from './relay-delivery.types';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';

class InMemoryMessagesStore implements RelayMessagesStore {
  messages: RelayMessageRecord[] = [];
  suppressions: { shopId: string; email: string; reason: SuppressionReason }[] = [];
  failRecordOutcome = false;

  async withIdempotencyLock<T>(
    _shopId: string,
    _idempotencyKey: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return callback();
  }

  async findByIdempotencyKey(shopId: string, idempotencyKey: string) {
    return (
      this.messages.find(
        (message) => message.shopId === shopId && message.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async findByIdForShop(messageId: string, shopId: string) {
    return (
      this.messages.find((message) => message.id === messageId && message.shopId === shopId) ?? null
    );
  }

  async findByProviderMessageId(providerMessageId: string) {
    return this.messages.find((message) => message.providerMessageId === providerMessageId) ?? null;
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
    if (this.failRecordOutcome) {
      throw new Error('insert failed');
    }
    const record: RelayMessageRecord = { ...input, updatedAt: input.acceptedAt };
    this.messages.push(record);
    return record;
  }

  async applyDeliveryEvent(): Promise<boolean> {
    return false;
  }

  async countSendsSince(shopId: string, since: Date) {
    return this.messages.filter(
      (message) =>
        message.shopId === shopId && message.acceptedAt >= since && message.status !== 'failed'
    ).length;
  }

  async isRecipientSuppressed(shopId: string, email: string) {
    return this.suppressions.some(
      (entry) => entry.shopId === shopId && entry.email === email.toLowerCase()
    );
  }

  async addSuppression(input: {
    shopId: string;
    email: string;
    reason: SuppressionReason;
    occurredAt: Date;
  }) {
    this.suppressions.push({
      shopId: input.shopId,
      email: input.email.toLowerCase(),
      reason: input.reason
    });
  }

  async getReputationCounts(): Promise<ShopReputationCounts> {
    return { attempted: 0, hardFailures: 0 };
  }
}

const shop: AuthenticatedRelayShop = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  monthlySendQuota: 2,
  tokenId: 'token_1',
  instanceId: 'instance-a'
};

function makeInput(overrides?: Partial<SendReceiptMessageInput>): SendReceiptMessageInput {
  return {
    idempotencyKey: 'payment-receipt-pm-1',
    messageType: 'paymentReceipt',
    recipientEmail: 'homeowner@example.com',
    fromName: 'Acme HVAC',
    replyToEmail: 'office@acmehvac.example',
    subject: 'Your payment receipt',
    bodyText: 'We received your payment of $100.00.',
    ...overrides
  };
}

function makeAdapter(
  result: ProviderSendResult
): EmailSendAdapter & { calls: ProviderSendInput[] } {
  const calls: ProviderSendInput[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
      return result;
    }
  };
}

function makeService(store: RelayMessagesStore, adapter: EmailSendAdapter): SendReceiptService {
  return new SendReceiptService(store, adapter, () => new Date('2026-06-16T12:00:00Z'));
}

describe('SendReceiptService', () => {
  it('sends through the billing sender with no attachment and records the outcome', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-1' });
    const service = makeService(store, adapter);

    const result = await service.sendReceiptMessage(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-1');
      expect(result.relayMessageId).toBe(store.messages[0]?.id);
    }
    expect(store.messages).toHaveLength(1);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toMatchObject({
      sender: 'receipt',
      idempotencyKey: 'relay/shop_1/payment-receipt-pm-1'
    });
    expect(adapter.calls[0].attachment).toBeUndefined();
  });

  it('replays a recorded sent outcome without re-sending', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-2' });
    const service = makeService(store, adapter);

    const first = await service.sendReceiptMessage(shop, makeInput());
    const second = await service.sendReceiptMessage(shop, makeInput());

    expect(adapter.calls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('does not record retryable failures so retries get a fresh attempt', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({
      kind: 'failed',
      code: 'deliveryUnavailable',
      retryable: true,
      message: 'unavailable'
    });
    const service = makeService(store, adapter);

    const result = await service.sendReceiptMessage(shop, makeInput());

    expect(result.kind).toBe('failed');
    expect(store.messages).toHaveLength(0);

    const retry = await service.sendReceiptMessage(shop, makeInput());
    expect(retry.kind).toBe('failed');
    expect(adapter.calls).toHaveLength(2);
  });

  it('blocks suppressed recipients before calling the provider', async () => {
    const store = new InMemoryMessagesStore();
    store.suppressions.push({ shopId: 'shop_1', email: 'homeowner@example.com', reason: 'bounce' });
    const adapter = makeAdapter({ kind: 'sent' });
    const service = makeService(store, adapter);

    const result = await service.sendReceiptMessage(shop, makeInput());

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('recipientUnavailable');
    }
    expect(adapter.calls).toHaveLength(0);
  });

  it('blocks sends past the monthly quota', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-q' });
    const service = makeService(store, adapter);

    await service.sendReceiptMessage(shop, makeInput({ idempotencyKey: 'k1' }));
    await service.sendReceiptMessage(shop, makeInput({ idempotencyKey: 'k2' }));
    const blocked = await service.sendReceiptMessage(shop, makeInput({ idempotencyKey: 'k3' }));

    expect(blocked.kind).toBe('failed');
    if (blocked.kind === 'failed') {
      expect(blocked.code).toBe('sendingLimitReached');
    }
    expect(adapter.calls).toHaveLength(2);
  });

  it('still reports sent when recording fails after provider acceptance', async () => {
    const store = new InMemoryMessagesStore();
    store.failRecordOutcome = true;
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-4' });
    const service = makeService(store, adapter);

    const result = await service.sendReceiptMessage(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-4');
      expect(result.relayMessageId).toBe('unrecorded');
    }
  });
});
