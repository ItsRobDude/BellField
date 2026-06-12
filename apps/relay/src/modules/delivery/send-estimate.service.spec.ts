import { estimateEmailMaxAttachmentBytes, type RelayAcceptancePayload } from '@bellfield/contracts';
import { SendEstimateService, type SendEstimateDocumentInput } from './send-estimate.service';
import { AcceptanceLinksService } from '../acceptance/acceptance.service';
import type {
  AcceptanceLinksStore,
  RecordAcceptanceLinkInput
} from '../acceptance/acceptance.types';
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

/** The send path only records links; the rest of the store is unused here. */
class StubAcceptanceStore implements AcceptanceLinksStore {
  records: RecordAcceptanceLinkInput[] = [];
  failRecord = false;

  async recordLinkSupersedingOpen(input: RecordAcceptanceLinkInput) {
    if (this.failRecord) {
      throw new Error('record failed');
    }
    this.records.push(input);
  }

  async findByTokenHash() {
    return null;
  }

  async applyDecision() {
    return null;
  }

  async listUndeliveredDecisions() {
    return [];
  }

  async acknowledgeDecision() {
    return false;
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

function makeAcceptance(overrides?: Partial<RelayAcceptancePayload>): RelayAcceptancePayload {
  return {
    estimateRef: 'estimate-1',
    estimateVersion: 3,
    title: 'AC replacement options',
    options: [{ id: 'opt-good', label: 'Good — repair', totalCents: 84_500 }],
    ...overrides
  };
}

function makeAdapter(
  result: ProviderSendResult
): EmailSendAdapter & { calls: { bodyText: string }[] } {
  const calls: { bodyText: string }[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
      return result;
    }
  };
}

function makeService(
  store: RelayMessagesStore,
  adapter: EmailSendAdapter,
  acceptanceStore: AcceptanceLinksStore = new StubAcceptanceStore()
): SendEstimateService {
  const acceptanceLinks = new AcceptanceLinksService(acceptanceStore, 'https://relay.test');
  return new SendEstimateService(
    store,
    adapter,
    acceptanceLinks,
    () => new Date('2026-06-11T12:00:00Z')
  );
}

describe('SendEstimateService', () => {
  it('sends through the provider and records the outcome', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-1' });
    const service = makeService(store, adapter);

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-1');
      expect(result.relayMessageId).toBe(store.messages[0]?.id);
      expect(result.acceptanceUrl).toBeUndefined();
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
    const service = makeService(store, adapter);

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
    const service = makeService(store, adapter);

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
    const service = makeService(store, adapter);

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
    const service = makeService(store, adapter);

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
    const service = makeService(store, adapter);

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
    const service = makeService(store, adapter);
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
    const service = makeService(store, adapter);

    const result = await service.sendEstimateDocument(shop, makeInput());

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.providerMessageId).toBe('prov-4');
    }
  });

  it('mints an acceptance link, splices the template token, and persists after sending', async () => {
    const store = new InMemoryMessagesStore();
    const acceptanceStore = new StubAcceptanceStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-5' });
    const service = makeService(store, adapter, acceptanceStore);

    const result = await service.sendEstimateDocument(
      shop,
      makeInput({
        bodyText: 'Review here: {acceptanceLink}\nThanks!',
        acceptance: makeAcceptance()
      })
    );

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.acceptanceUrl).toMatch(/^https:\/\/relay\.test\/a\/[0-9a-f]{40}$/);
      expect(result.acceptanceLinkId).toBe(acceptanceStore.records[0]?.id);
      expect(adapter.calls[0].bodyText).toBe(`Review here: ${result.acceptanceUrl}\nThanks!`);
      expect(adapter.calls[0].bodyText).not.toContain('{acceptanceLink}');
    }
    expect(acceptanceStore.records).toHaveLength(1);
    expect(acceptanceStore.records[0]).toMatchObject({
      shopId: 'shop_1',
      relayMessageId: store.messages[0]?.id,
      estimateRef: 'estimate-1',
      estimateVersion: 3
    });
    // Default expiry: 30 days from the send.
    expect(acceptanceStore.records[0].expiresAt).toEqual(new Date('2026-07-11T12:00:00Z'));
  });

  it('appends the link when the template lacks the token', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent' });
    const service = makeService(store, adapter);

    const result = await service.sendEstimateDocument(
      shop,
      makeInput({ bodyText: 'Estimate attached.', acceptance: makeAcceptance() })
    );

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(adapter.calls[0].bodyText).toContain('Estimate attached.');
      expect(adapter.calls[0].bodyText).toContain(
        `\n\nReview and respond to this estimate online:\n${result.acceptanceUrl}`
      );
    }
  });

  it('clamps acceptance expiry to the 7-90 day bounds', async () => {
    const store = new InMemoryMessagesStore();
    const acceptanceStore = new StubAcceptanceStore();
    const adapter = makeAdapter({ kind: 'sent' });
    const service = makeService(store, adapter, acceptanceStore);

    await service.sendEstimateDocument(
      shop,
      makeInput({
        idempotencyKey: 'k-long',
        acceptance: makeAcceptance({ expiresInDays: 365 })
      })
    );
    await service.sendEstimateDocument(
      shop,
      makeInput({
        idempotencyKey: 'k-short',
        acceptance: makeAcceptance({ expiresInDays: 1 })
      })
    );

    expect(acceptanceStore.records[0].expiresAt).toEqual(new Date('2026-09-09T12:00:00Z'));
    expect(acceptanceStore.records[1].expiresAt).toEqual(new Date('2026-06-18T12:00:00Z'));
  });

  it('persists no link when the provider fails', async () => {
    const store = new InMemoryMessagesStore();
    const acceptanceStore = new StubAcceptanceStore();
    const retryableAdapter = makeAdapter({
      kind: 'failed',
      code: 'deliveryUnavailable',
      retryable: true,
      message: 'unavailable'
    });
    const retryableService = makeService(store, retryableAdapter, acceptanceStore);
    await retryableService.sendEstimateDocument(shop, makeInput({ acceptance: makeAcceptance() }));

    const rejectedAdapter = makeAdapter({
      kind: 'failed',
      code: 'deliveryRejected',
      retryable: false,
      message: 'rejected'
    });
    const rejectedService = makeService(store, rejectedAdapter, acceptanceStore);
    await rejectedService.sendEstimateDocument(
      shop,
      makeInput({ idempotencyKey: 'k-rejected', acceptance: makeAcceptance() })
    );

    expect(acceptanceStore.records).toHaveLength(0);
  });

  it('still returns sent with the link URL when link recording fails', async () => {
    const store = new InMemoryMessagesStore();
    const acceptanceStore = new StubAcceptanceStore();
    acceptanceStore.failRecord = true;
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-6' });
    const service = makeService(store, adapter, acceptanceStore);

    const result = await service.sendEstimateDocument(
      shop,
      makeInput({ acceptance: makeAcceptance() })
    );

    expect(result.kind).toBe('sent');
    if (result.kind === 'sent') {
      expect(result.acceptanceUrl).toMatch(/^https:\/\/relay\.test\/a\//);
    }
  });

  it('omits the acceptance URL on idempotent replays', async () => {
    const store = new InMemoryMessagesStore();
    const adapter = makeAdapter({ kind: 'sent', providerMessageId: 'prov-7' });
    const service = makeService(store, adapter);

    const first = await service.sendEstimateDocument(
      shop,
      makeInput({ acceptance: makeAcceptance() })
    );
    const replay = await service.sendEstimateDocument(
      shop,
      makeInput({ acceptance: makeAcceptance() })
    );

    expect(adapter.calls).toHaveLength(1);
    expect(first.kind).toBe('sent');
    expect(replay.kind).toBe('sent');
    if (first.kind === 'sent' && replay.kind === 'sent') {
      expect(first.acceptanceUrl).toBeDefined();
      expect(replay.acceptanceUrl).toBeUndefined();
    }
  });
});
