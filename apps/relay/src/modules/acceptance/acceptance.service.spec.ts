import {
  AcceptanceLinksService,
  clampAcceptanceExpiryDays,
  spliceAcceptanceUrl,
  type PreparedAcceptanceLink
} from './acceptance.service';
import type {
  AcceptanceLinkRecord,
  AcceptanceLinksStore,
  ApplyDecisionInput,
  RecordAcceptanceLinkInput
} from './acceptance.types';

class InMemoryAcceptanceLinksStore implements AcceptanceLinksStore {
  links: AcceptanceLinkRecord[] = [];
  shopNames = new Map<string, string>([['shop_1', 'Acme HVAC']]);

  async recordLinkSupersedingOpen(input: RecordAcceptanceLinkInput) {
    for (const link of this.links) {
      if (
        link.shopId === input.shopId &&
        link.estimateRef === input.estimateRef &&
        link.status === 'open'
      ) {
        link.status = 'superseded';
      }
    }
    this.links.push({
      id: input.id,
      shopId: input.shopId,
      relayMessageId: input.relayMessageId,
      tokenHash: input.tokenHash,
      estimateRef: input.estimateRef,
      estimateVersion: input.estimateVersion,
      title: input.title,
      options: input.options,
      status: 'open',
      decidedOptionId: null,
      declineReasons: [],
      homeownerNote: null,
      decidedAt: null,
      deliveredAt: null,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt
    });
  }

  async findByTokenHash(tokenHash: string) {
    const link = this.links.find((candidate) => candidate.tokenHash === tokenHash);
    if (!link) {
      return null;
    }
    return { ...link, shopDisplayName: this.shopNames.get(link.shopId) ?? 'Unknown shop' };
  }

  async applyDecision(input: ApplyDecisionInput) {
    const link = this.links.find(
      (candidate) =>
        candidate.tokenHash === input.tokenHash &&
        candidate.status === 'open' &&
        candidate.expiresAt.getTime() > input.decidedAt.getTime()
    );
    if (!link) {
      return null;
    }
    link.status = input.decision;
    link.decidedOptionId = input.optionId;
    link.declineReasons = input.declineReasons;
    link.homeownerNote = input.note;
    link.decidedAt = input.decidedAt;
    return { ...link };
  }

  async listUndeliveredDecisions(shopId: string) {
    return this.links.filter(
      (link) => link.shopId === shopId && link.decidedAt !== null && link.deliveredAt === null
    );
  }

  async acknowledgeDecision(shopId: string, acceptanceLinkId: string, deliveredAt: Date) {
    const link = this.links.find(
      (candidate) =>
        candidate.id === acceptanceLinkId &&
        candidate.shopId === shopId &&
        candidate.decidedAt !== null
    );
    if (!link) {
      return false;
    }
    link.deliveredAt = link.deliveredAt ?? deliveredAt;
    return true;
  }
}

const now = new Date('2026-06-12T12:00:00Z');
const later = new Date('2026-06-12T12:05:00Z');

function makeService(store: InMemoryAcceptanceLinksStore): AcceptanceLinksService {
  return new AcceptanceLinksService(store, 'https://relay.test');
}

async function mintLink(
  service: AcceptanceLinksService,
  overrides?: {
    estimateRef?: string;
    options?: { id: string; label: string; totalCents: number }[];
    expiresInDays?: number;
  }
): Promise<PreparedAcceptanceLink> {
  const prepared = service.prepareLink();
  await service.recordMintedLink({
    prepared,
    shopId: 'shop_1',
    relayMessageId: 'msg-1',
    acceptance: {
      estimateRef: overrides?.estimateRef ?? 'estimate-1',
      estimateVersion: 3,
      title: 'AC replacement options',
      options: overrides?.options ?? [
        { id: 'opt-good', label: 'Good — repair', totalCents: 84_500 }
      ],
      expiresInDays: overrides?.expiresInDays
    },
    now
  });
  return prepared;
}

describe('clampAcceptanceExpiryDays', () => {
  it('defaults, clamps both bounds, and passes in-range values through', () => {
    expect(clampAcceptanceExpiryDays(undefined)).toBe(30);
    expect(clampAcceptanceExpiryDays(1)).toBe(7);
    expect(clampAcceptanceExpiryDays(365)).toBe(90);
    expect(clampAcceptanceExpiryDays(45)).toBe(45);
    expect(clampAcceptanceExpiryDays(2.5)).toBe(30);
  });
});

describe('spliceAcceptanceUrl', () => {
  it('replaces every template token occurrence', () => {
    expect(spliceAcceptanceUrl('A {acceptanceLink} B {acceptanceLink}', 'URL')).toBe('A URL B URL');
  });

  it('appends when the token is missing so no email goes out without its link', () => {
    expect(spliceAcceptanceUrl('Hello.', 'URL')).toBe(
      'Hello.\n\nReview and respond to this estimate online:\nURL'
    );
  });
});

describe('AcceptanceLinksService', () => {
  it('builds the public URL from the configured base', () => {
    const service = makeService(new InMemoryAcceptanceLinksStore());
    const prepared = service.prepareLink();
    expect(prepared.url).toBe(`https://relay.test/a/${prepared.token}`);
    expect(prepared.token).toMatch(/^[0-9a-f]{40}$/);
  });

  it('supersedes prior open links for the same estimate on resend', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);

    const first = await mintLink(service);
    const second = await mintLink(service);
    const unrelated = await mintLink(service, { estimateRef: 'estimate-2' });

    expect((await service.getPageState(first.token, later)).kind).toBe('superseded');
    expect((await service.getPageState(second.token, later)).kind).toBe('open');
    expect((await service.getPageState(unrelated.token, later)).kind).toBe('open');
  });

  it('reports not-found for malformed and unknown tokens', async () => {
    const service = makeService(new InMemoryAcceptanceLinksStore());
    expect((await service.getPageState('not-a-token', now)).kind).toBe('notFound');
    expect((await service.getPageState('f'.repeat(40), now)).kind).toBe('notFound');
  });

  it('reports expired once expires_at passes, without any sweeper', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service, { expiresInDays: 7 });

    const beforeExpiry = new Date('2026-06-19T11:59:59Z');
    const afterExpiry = new Date('2026-06-19T12:00:00Z');
    expect((await service.getPageState(prepared.token, beforeExpiry)).kind).toBe('open');
    expect((await service.getPageState(prepared.token, afterExpiry)).kind).toBe('expired');

    const decision = await service.applyDecision(
      prepared.token,
      { decision: 'approve' },
      null,
      afterExpiry
    );
    expect(decision).toEqual({ kind: 'alreadySettled', state: 'expired' });
  });

  it('approves the single option by default', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);

    const outcome = await service.applyDecision(
      prepared.token,
      { decision: 'approve', note: '  Gate code is 1234.  ' },
      '203.0.113.5',
      now
    );

    expect(outcome).toEqual({ kind: 'recorded', decision: 'approved' });
    const state = await service.getPageState(prepared.token, later);
    expect(state).toMatchObject({
      kind: 'decided',
      decision: 'approved',
      selectedOptionLabel: 'Good — repair'
    });
    expect(store.links[0].homeownerNote).toBe('Gate code is 1234.');
  });

  it('requires a valid option choice when the estimate has options', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const options = [
      { id: 'opt-good', label: 'Good — repair', totalCents: 84_500 },
      { id: 'opt-best', label: 'Best — replace', totalCents: 412_000 }
    ];
    const prepared = await mintLink(service, { options });

    const missing = await service.applyDecision(prepared.token, { decision: 'approve' }, null, now);
    expect(missing.kind).toBe('invalid');

    const unknown = await service.applyDecision(
      prepared.token,
      { decision: 'approve', optionId: 'opt-imaginary' },
      null,
      now
    );
    expect(unknown.kind).toBe('invalid');

    const chosen = await service.applyDecision(
      prepared.token,
      { decision: 'approve', optionId: 'opt-best' },
      null,
      now
    );
    expect(chosen).toEqual({ kind: 'recorded', decision: 'approved' });
    expect(store.links[0].decidedOptionId).toBe('opt-best');
  });

  it('records a decline with deduped fixed reasons and a note', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);

    const outcome = await service.applyDecision(
      prepared.token,
      {
        decision: 'decline',
        declineReasons: ['price', 'questions', 'price'],
        note: 'Call me in the fall.'
      },
      null,
      now
    );

    expect(outcome).toEqual({ kind: 'recorded', decision: 'declined' });
    expect(store.links[0].declineReasons).toEqual(['price', 'questions']);
    expect(store.links[0].homeownerNote).toBe('Call me in the fall.');
  });

  it('rejects unknown reasons, reasons on approve, and options on decline', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);

    const unknownReason = await service.applyDecision(
      prepared.token,
      { decision: 'decline', declineReasons: ['tooSunny'] },
      null,
      now
    );
    expect(unknownReason.kind).toBe('invalid');

    const reasonsOnApprove = await service.applyDecision(
      prepared.token,
      { decision: 'approve', declineReasons: ['price'] },
      null,
      now
    );
    expect(reasonsOnApprove.kind).toBe('invalid');

    const optionOnDecline = await service.applyDecision(
      prepared.token,
      { decision: 'decline', optionId: 'opt-good' },
      null,
      now
    );
    expect(optionOnDecline.kind).toBe('invalid');

    // Nothing invalid ever settled the link.
    expect((await service.getPageState(prepared.token, later)).kind).toBe('open');
  });

  it('rejects an over-long note before touching the link', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);

    const outcome = await service.applyDecision(
      prepared.token,
      { decision: 'approve', note: 'x'.repeat(501) },
      null,
      now
    );

    expect(outcome.kind).toBe('invalid');
    expect((await service.getPageState(prepared.token, later)).kind).toBe('open');
  });

  it('lets the first decision win and reports the settled state afterward', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);

    const first = await service.applyDecision(prepared.token, { decision: 'approve' }, null, now);
    const second = await service.applyDecision(
      prepared.token,
      { decision: 'decline' },
      null,
      later
    );

    expect(first).toEqual({ kind: 'recorded', decision: 'approved' });
    expect(second).toEqual({ kind: 'alreadySettled', state: 'approved' });
  });

  it('delivers decisions at-least-once until acked', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    const prepared = await mintLink(service);
    await service.applyDecision(
      prepared.token,
      { decision: 'decline', declineReasons: ['price'] },
      null,
      now
    );

    const firstPoll = await service.listUndeliveredDecisions('shop_1');
    expect(firstPoll).toHaveLength(1);
    expect(firstPoll[0]).toMatchObject({
      estimateRef: 'estimate-1',
      estimateVersion: 3,
      decision: 'declined',
      declineReasons: ['price'],
      decidedAt: now.toISOString()
    });

    const secondPoll = await service.listUndeliveredDecisions('shop_1');
    expect(secondPoll).toHaveLength(1);

    const acked = await service.acknowledgeDecision('shop_1', firstPoll[0].acceptanceLinkId, later);
    expect(acked).toBe(true);
    expect(await service.listUndeliveredDecisions('shop_1')).toHaveLength(0);

    // Ack is idempotent; unknown ids and foreign shops are refused.
    expect(await service.acknowledgeDecision('shop_1', firstPoll[0].acceptanceLinkId, later)).toBe(
      true
    );
    expect(await service.acknowledgeDecision('shop_1', 'unknown-id', later)).toBe(false);
    expect(await service.acknowledgeDecision('shop_2', firstPoll[0].acceptanceLinkId, later)).toBe(
      false
    );
  });

  it('never returns an undecided link from the decisions poll', async () => {
    const store = new InMemoryAcceptanceLinksStore();
    const service = makeService(store);
    await mintLink(service);

    expect(await service.listUndeliveredDecisions('shop_1')).toHaveLength(0);
  });
});
