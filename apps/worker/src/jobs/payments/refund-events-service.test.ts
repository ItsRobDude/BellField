import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RelayRefundEvent } from '../delivery/delivery-types';
import { RefundEventsService } from './refund-events-service';
import type {
  RefundEventApplyOutcome,
  RefundEventsRelayClient,
  RefundEventsStore
} from './refund-events.types';

class StubStore implements RefundEventsStore {
  outcome: RefundEventApplyOutcome = 'applied';
  failApply = false;
  appliedEvents: RelayRefundEvent[] = [];

  async applyRelayRefundEvent(event: RelayRefundEvent): Promise<RefundEventApplyOutcome> {
    if (this.failApply) {
      throw new Error('apply failed');
    }
    this.appliedEvents.push(event);
    return this.outcome;
  }
}

class StubRelay implements RefundEventsRelayClient {
  unavailable = false;
  events: RelayRefundEvent[] = [];
  acked: string[] = [];

  async getRefundEvents() {
    return this.unavailable
      ? ({ kind: 'unavailable' } as const)
      : ({ kind: 'events', events: this.events } as const);
  }

  async acknowledgeRefundEvent(refundEventId: string): Promise<boolean> {
    this.acked.push(refundEventId);
    return true;
  }
}

function makeEvent(overrides?: Partial<RelayRefundEvent>): RelayRefundEvent {
  return {
    refundEventId: 're-event-1',
    refundRequestId: 'rr-1',
    provider: 'stripe',
    providerRefundId: 're_1',
    providerPaymentId: 'pi_1',
    providerSessionId: 'cs_1',
    jobRef: 'job-1',
    amountCents: 10_000,
    currency: 'USD',
    applicationFeeRefundedCents: 100,
    status: 'succeeded',
    failureReason: null,
    occurredAt: '2026-06-14T12:00:00.000Z',
    ...overrides
  };
}

test('RefundEventsService applies and acks succeeded refund events', async () => {
  const store = new StubStore();
  const relay = new StubRelay();
  relay.events = [
    makeEvent(),
    makeEvent({ refundEventId: 're-event-2', providerRefundId: 're_2' })
  ];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 2, applied: 2, acknowledged: 2, deferred: 0 });
  assert.deepEqual(relay.acked, ['re-event-1', 're-event-2']);
});

test('RefundEventsService acks already-applied events without double-counting applied', async () => {
  const store = new StubStore();
  store.outcome = 'alreadyApplied';
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 1, deferred: 0 });
  assert.deepEqual(relay.acked, ['re-event-1']);
});

test('RefundEventsService acks a recorded failed refund', async () => {
  const store = new StubStore();
  store.outcome = 'failedRecorded';
  const relay = new StubRelay();
  relay.events = [makeEvent({ status: 'failed', failureReason: 'card_declined' })];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 1, deferred: 0 });
  assert.deepEqual(relay.acked, ['re-event-1']);
});

test('RefundEventsService does NOT ack a deferred refund (payment not recorded yet)', async () => {
  const store = new StubStore();
  store.outcome = 'deferred';
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 0, deferred: 1 });
  assert.deepEqual(relay.acked, []);
});

test('RefundEventsService acks a dead-lettered refund', async () => {
  const store = new StubStore();
  store.outcome = 'deadLettered';
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 1, deferred: 0 });
  assert.deepEqual(relay.acked, ['re-event-1']);
});

test('RefundEventsService skips ack when local apply throws', async () => {
  const store = new StubStore();
  store.failApply = true;
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 0, deferred: 0 });
  assert.deepEqual(relay.acked, []);
});

test('RefundEventsService does nothing when the relay is unavailable', async () => {
  const store = new StubStore();
  const relay = new StubRelay();
  relay.unavailable = true;
  relay.events = [makeEvent()];
  const service = new RefundEventsService(store, relay);

  const summary = await service.pollRefundEvents();

  assert.deepEqual(summary, { fetched: 0, applied: 0, acknowledged: 0, deferred: 0 });
  assert.deepEqual(store.appliedEvents, []);
});
