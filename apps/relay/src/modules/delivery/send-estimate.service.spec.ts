import { estimateEmailMaxAttachmentBytes } from '@bellfield/contracts';
import { SendEstimateService, type SendEstimateDocumentInput } from './send-estimate.service';
import type {
  EmailSendAdapter,
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
    const record: RelayMessageRecord = {
      ...input,
      failureCode: input.failureCode,
      providerMessageId: input.providerMessageId,
      updatedAt: input.acceptedAt
    };
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

function makeInput(overrides?: Partial<SendEstimateDocumentInput>): SendEstimateDocumentInput {
  return {
    idempotencyKey: 'estimate-send-msg-1',
    recipientEmail: 'homeowner@example.com',
    fromName: 'Acme HVAC',
    replyToEmail: 'office@acmehvac.example',
    subject: 'Your estimate',
    bodyText: 'Estimate attached.',
    document: {
      filename: 'estimate.pdf',
      contentType: 'application/pdf',
      bytesBase64: Buffer.from('%PDF-1.7 test').toString('base64')
    },
    ...overrides
  };
}

function makeAdapter(result: ProviderSendResult): EmailSendAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
      return result;
    }
  };
}

describe('SendEstimateService', () => {
  it('sends through the provider and records the outcome', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-1' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-1');
      expect(result.relayMessageId).toBe(store.messages[0]?.id);
    }
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ status: 'sent', providerMessageId: 'prov-1' });
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toMatchObject({
      idempotencyKey: 'relay/shop_1/estimate-send-msg-1'
    });
  });

  it('replays a recorded sent outcome without re-sending', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-2' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    const first = await service.sendEstimateDocument(shop, makeInput());
    const second = await service.sendEstimateDocument(shop, makeInput());

    expect(adapter.calls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('replays a recorded non-retryable failure', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({
      kind: 'failed',
      code: 'deliveryRejected',
      retryable: false,
      message: 'rejected'
    });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    await service.sendEstimateDocument(shop, makeInput());
    const replay = await service.sendEstimateDocument(shop, makeInput());

    expect(adapter.calls).toHaveLength(1);
    expect(replay.kind).toBe('failed');
    if (replay.kind === 'failed') {
      expect(replay.code).toBe('deliveryRejected');
      expect(replay.retryable).toBe(false);
    }
  });

  it('does not record retryable failures so retries get a fresh attempt', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({
      kind: 'failed',
      code: 'deliveryUnavailable',
      retryable: true,
      message: 'unavailable'
    });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('failed');
    expect(store.messages).toHaveLength(0);

    const retry = await service.sendEstimateDocument(shop, makeInput());
    expect(retry.kind).toBe('failed');
    expect(adapter.calls).toHaveLength(2);
  });

  it('blocks sends past the monthly quota', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-3' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    await service.sendEstimateDocument(shop, makeInput({ idempotencyKey: 'k1' }));
    await service.sendEstimateDocument(shop, makeInput({ idempotencyKey: 'k2' }));
    const blocked = await service.sendEstimateDocument(shop, makeInput({ idempotencyKey: 'k3' }));

    expect(blocked.kind).toBe('failed');
    if (blocked.kind === 'failed') {
      expect(blocked.code).toBe('sendingLimitReached');
      expect(blocked.retryable).toBe(false);
    }
    expect(adapter.calls).toHaveLength(2);
  });

  it('blocks suppressed recipients before calling the provider', async () => {
    const store = new InMemoryMessagesStore();
    store.suppressions.push({
      shopId: 'shop_1',
      email: 'homeowner@example.com',
      reason: 'bounce'
    });
    const adapter = makeAdapter({ kind: 'sent' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('recipientUnavailable');
    }
    expect(adapter.calls).toHaveLength(0);
  });

  it('rejects attachments over the shared cap without calling the provider', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));
    const oversized = Buffer.alloc(estimateEmailMaxAttachmentBytes + 1, 1).toString('base64');

    const result = await service.sendEstimateDocument(
      shop,
      makeInput({
        document: { filename: 'big.pdf', contentType: 'application/pdf', bytesBase64: oversized }
      })
    );

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('deliveryRejected');
      expect(result.retryable).toBe(false);
    }
    expect(adapter.calls).toHaveLength(0);
  });

  it('still reports sent when recording fails after provider acceptance', async () => {
    const store = new InMemoryMessagesStore();
    store.failRecordOutcome = true;
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-4' });
    const service = new SendEstimateService(store, adapter, () => new Date('2026-06-11T12:00:00Z'));

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-4');
    }
  });
});
