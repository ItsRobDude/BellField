import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DeliveryService } from './delivery-service';
import type {
  DeliveryStore,
  DeliveryTimelineEntry,
  DueQueuedDelivery,
  ExpiredDelivery,
  PollableDelivery,
  RelayDeliveryClient,
  RelaySendOutcome,
  RelayStatusOutcome
} from './delivery-types';

class InMemoryDeliveryStore implements DeliveryStore {
  due: DueQueuedDelivery[] = [];
  expired: ExpiredDelivery[] = [];
  pollable: PollableDelivery[] = [];
  timeline: DeliveryTimelineEntry[] = [];
  sentCalls: { id: string; providerMessageId: string | null }[] = [];
  failedCalls: { id: string; code: string }[] = [];
  retryCalls: { id: string; nextAttemptAt: Date }[] = [];
  appliedStates: { id: string; state: string }[] = [];
  touched: string[] = [];
  applyResult = true;

  async listDueQueued(): Promise<DueQueuedDelivery[]> {
    return this.due;
  }

  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    this.sentCalls.push({ id, providerMessageId });
  }

  async markFailed(id: string, code: string): Promise<void> {
    this.failedCalls.push({ id, code });
  }

  async scheduleRetry(id: string, nextAttemptAt: Date): Promise<void> {
    this.retryCalls.push({ id, nextAttemptAt });
  }

  async expireDue(): Promise<ExpiredDelivery[]> {
    return this.expired;
  }

  async addTimelineEntry(entry: DeliveryTimelineEntry): Promise<void> {
    this.timeline.push(entry);
  }

  async listPollable(): Promise<PollableDelivery[]> {
    return this.pollable;
  }

  async applyDeliveryState(id: string, state: 'delivered' | 'bounced' | 'complained') {
    this.appliedStates.push({ id, state });
    return this.applyResult;
  }

  async touchStatusChecked(id: string): Promise<void> {
    this.touched.push(id);
  }
}

class StubRelayClient implements RelayDeliveryClient {
  sendOutcome: RelaySendOutcome = { kind: 'sent', relayMessageId: 'relay-1' };
  statusOutcome: RelayStatusOutcome = { kind: 'status', state: 'delivered' };
  sendCalls: unknown[] = [];

  async sendEstimateDocument(input: unknown): Promise<RelaySendOutcome> {
    this.sendCalls.push(input);
    return this.sendOutcome;
  }

  async getMessageStatus(): Promise<RelayStatusOutcome> {
    return this.statusOutcome;
  }
}

async function withMediaRoot(
  run: (mediaRoot: string, storagePath: string, sha256: string) => Promise<void>
): Promise<void> {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), 'bellfield-delivery-test-'));
  try {
    const storagePath = path.join('customer-documents', 'jobs', 'job-1', 'estimate.pdf');
    const absolute = path.join(mediaRoot, storagePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    const bytes = Buffer.from('%PDF-1.7 worker test');
    writeFileSync(absolute, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await run(mediaRoot, storagePath, sha256);
  } finally {
    rmSync(mediaRoot, { force: true, recursive: true });
  }
}

function makeDue(storagePath: string, sha256: string): DueQueuedDelivery {
  return {
    id: 'msg-1',
    jobId: 'job-1',
    recipientEmail: 'homeowner@example.com',
    subject: 'Your estimate',
    bodyText: 'Estimate attached.',
    fromName: 'Acme HVAC',
    replyToEmail: 'office@acme.example',
    sentByName: 'Dispatcher',
    attemptCount: 1,
    expiresAt: new Date('2026-06-12T00:00:00Z'),
    snapshotStoragePath: storagePath,
    snapshotSha256: sha256,
    snapshotFilename: 'estimate.pdf',
    estimateTitle: 'AC replacement'
  };
}

const fixedNow = () => new Date('2026-06-11T12:00:00Z');

void test('sends a due queued delivery and records the timeline entry', async () => {
  await withMediaRoot(async (mediaRoot, storagePath, sha256) => {
    const store = new InMemoryDeliveryStore();
    const relay = new StubRelayClient();
    store.due = [makeDue(storagePath, sha256)];
    const service = new DeliveryService({ mediaRoot }, store, relay, { now: fixedNow });

    const summary = await service.processDueDeliveries();

    assert.equal(summary.sent, 1);
    assert.deepEqual(store.sentCalls, [{ id: 'msg-1', providerMessageId: 'relay-1' }]);
    assert.equal(store.timeline.length, 1);
    assert.equal(store.timeline[0].kind, 'estimateSent');
    assert.match(store.timeline[0].message, /Estimate sent to homeowner@example.com/);
    assert.equal(store.timeline[0].actorName, 'Dispatcher');
    const sendCall = relay.sendCalls[0] as { idempotencyKey: string; fromName: string };
    assert.equal(sendCall.idempotencyKey, 'estimate-send-msg-1');
    assert.equal(sendCall.fromName, 'Acme HVAC');
  });
});

void test('marks a non-retryable failure failed with a timeline entry', async () => {
  await withMediaRoot(async (mediaRoot, storagePath, sha256) => {
    const store = new InMemoryDeliveryStore();
    const relay = new StubRelayClient();
    relay.sendOutcome = { kind: 'failed', code: 'recipientUnavailable', retryable: false };
    store.due = [makeDue(storagePath, sha256)];
    const service = new DeliveryService({ mediaRoot }, store, relay, { now: fixedNow });

    const summary = await service.processDueDeliveries();

    assert.equal(summary.failed, 1);
    assert.deepEqual(store.failedCalls, [{ id: 'msg-1', code: 'recipientUnavailable' }]);
    assert.equal(store.timeline[0].kind, 'estimateDeliveryFailed');
  });
});

void test('reschedules a retryable failure on the backoff schedule', async () => {
  await withMediaRoot(async (mediaRoot, storagePath, sha256) => {
    const store = new InMemoryDeliveryStore();
    const relay = new StubRelayClient();
    relay.sendOutcome = { kind: 'failed', code: 'deliveryUnavailable', retryable: true };
    store.due = [makeDue(storagePath, sha256)];
    const service = new DeliveryService({ mediaRoot }, store, relay, { now: fixedNow });

    const summary = await service.processDueDeliveries();

    assert.equal(summary.rescheduled, 1);
    assert.equal(store.retryCalls.length, 1);
    // attemptCount 1 -> this failed attempt is #2 -> 10 minute delay.
    assert.equal(store.retryCalls[0].nextAttemptAt.getTime() - fixedNow().getTime(), 10 * 60_000);
    assert.equal(store.timeline.length, 0);
  });
});

void test('fails a delivery whose snapshot no longer matches its hash', async () => {
  await withMediaRoot(async (mediaRoot, storagePath) => {
    const store = new InMemoryDeliveryStore();
    const relay = new StubRelayClient();
    store.due = [makeDue(storagePath, 'f'.repeat(64))];
    const service = new DeliveryService({ mediaRoot }, store, relay, { now: fixedNow });

    const summary = await service.processDueDeliveries();

    assert.equal(summary.failed, 1);
    assert.deepEqual(store.failedCalls, [{ id: 'msg-1', code: 'unknown' }]);
    assert.equal(relay.sendCalls.length, 0);
  });
});

void test('writes timeline entries for expired queued sends', async () => {
  const store = new InMemoryDeliveryStore();
  const relay = new StubRelayClient();
  store.expired = [
    {
      id: 'msg-9',
      jobId: 'job-9',
      recipientEmail: 'old@example.com',
      sentByName: 'Dispatcher',
      estimateTitle: 'Furnace swap'
    }
  ];
  const service = new DeliveryService({ mediaRoot: tmpdir() }, store, relay, { now: fixedNow });

  const summary = await service.processDueDeliveries();

  assert.equal(summary.expired, 1);
  assert.equal(store.timeline.length, 1);
  assert.equal(store.timeline[0].kind, 'estimateDeliveryFailed');
  assert.match(store.timeline[0].message, /Furnace swap/);
});

void test('applies delivered state from the status poll', async () => {
  const store = new InMemoryDeliveryStore();
  const relay = new StubRelayClient();
  store.pollable = [{ id: 'msg-1', providerMessageId: 'relay-1' }];
  const service = new DeliveryService({ mediaRoot: tmpdir() }, store, relay, { now: fixedNow });

  const summary = await service.pollDeliveryStatuses();

  assert.deepEqual(summary, { polled: 1, updated: 1 });
  assert.deepEqual(store.appliedStates, [{ id: 'msg-1', state: 'delivered' }]);
});

void test('touches the check timestamp when the relay still says sent', async () => {
  const store = new InMemoryDeliveryStore();
  const relay = new StubRelayClient();
  relay.statusOutcome = { kind: 'status', state: 'sent' };
  store.pollable = [{ id: 'msg-1', providerMessageId: 'relay-1' }];
  const service = new DeliveryService({ mediaRoot: tmpdir() }, store, relay, { now: fixedNow });

  const summary = await service.pollDeliveryStatuses();

  assert.deepEqual(summary, { polled: 1, updated: 0 });
  assert.deepEqual(store.touched, ['msg-1']);
  assert.equal(store.appliedStates.length, 0);
});

void test('leaves messages untouched when the relay is unavailable', async () => {
  const store = new InMemoryDeliveryStore();
  const relay = new StubRelayClient();
  relay.statusOutcome = { kind: 'unavailable' };
  store.pollable = [{ id: 'msg-1', providerMessageId: 'relay-1' }];
  const service = new DeliveryService({ mediaRoot: tmpdir() }, store, relay, { now: fixedNow });

  const summary = await service.pollDeliveryStatuses();

  assert.deepEqual(summary, { polled: 1, updated: 0 });
  assert.equal(store.touched.length, 0);
});

void test('touches unknown relay message ids so they are not hammered', async () => {
  const store = new InMemoryDeliveryStore();
  const relay = new StubRelayClient();
  relay.statusOutcome = { kind: 'notFound' };
  store.pollable = [{ id: 'msg-1', providerMessageId: 'relay-1' }];
  const service = new DeliveryService({ mediaRoot: tmpdir() }, store, relay, { now: fixedNow });

  await service.pollDeliveryStatuses();

  assert.deepEqual(store.touched, ['msg-1']);
});
