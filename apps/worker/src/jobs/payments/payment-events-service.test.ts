import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RelayPaymentEvent } from '../delivery/delivery-types';
import { PaymentEventsService } from './payment-events-service';
import type {
  PaymentEventApplyOutcome,
  PaymentEventsRelayClient,
  PaymentEventsStore
} from './payment-events.types';

class StubStore implements PaymentEventsStore {
  applyOutcome: PaymentEventApplyOutcome = 'applied';
  failApply = false;
  appliedEvents: RelayPaymentEvent[] = [];

  async applyRelayPaymentEvent(event: RelayPaymentEvent): Promise<PaymentEventApplyOutcome> {
    if (this.failApply) {
      throw new Error('apply failed');
    }
    this.appliedEvents.push(event);
    return this.applyOutcome;
  }
}

class StubRelay implements PaymentEventsRelayClient {
  unavailable = false;
  events: RelayPaymentEvent[] = [];
  acked: string[] = [];

  async getPaymentEvents() {
    return this.unavailable
      ? ({ kind: 'unavailable' } as const)
      : ({ kind: 'events', events: this.events } as const);
  }

  async acknowledgePaymentEvent(paymentEventId: string): Promise<boolean> {
    this.acked.push(paymentEventId);
    return true;
  }
}

function makeEvent(overrides?: Partial<RelayPaymentEvent>): RelayPaymentEvent {
  return {
    paymentEventId: 'event-1',
    paymentSessionId: 'session-1',
    jobRef: 'job-1',
    invoiceRef: 'invoice-1',
    provider: 'stripe',
    providerPaymentId: 'pi_123',
    providerSessionId: 'cs_123',
    amountCents: 17_500,
    currency: 'USD',
    applicationFeeCents: 175,
    processorFeeCents: null,
    paidAt: '2026-06-13T12:00:00.000Z',
    ...overrides
  };
}

test('PaymentEventsService applies and acks relay payment events', async () => {
  const store = new StubStore();
  const relay = new StubRelay();
  relay.events = [
    makeEvent(),
    makeEvent({ paymentEventId: 'event-2', providerPaymentId: 'pi_456' })
  ];
  const service = new PaymentEventsService(store, relay);

  const summary = await service.pollPaymentEvents();

  assert.deepEqual(summary, { fetched: 2, applied: 2, acknowledged: 2 });
  assert.deepEqual(relay.acked, ['event-1', 'event-2']);
  assert.equal(store.appliedEvents.length, 2);
});

test('PaymentEventsService acks already-applied events without double-counting applied', async () => {
  const store = new StubStore();
  store.applyOutcome = 'alreadyApplied';
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new PaymentEventsService(store, relay);

  const summary = await service.pollPaymentEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 1 });
  assert.deepEqual(relay.acked, ['event-1']);
});

test('PaymentEventsService skips ack when local apply throws', async () => {
  const store = new StubStore();
  store.failApply = true;
  const relay = new StubRelay();
  relay.events = [makeEvent()];
  const service = new PaymentEventsService(store, relay);

  const summary = await service.pollPaymentEvents();

  assert.deepEqual(summary, { fetched: 1, applied: 0, acknowledged: 0 });
  assert.deepEqual(relay.acked, []);
});

test('PaymentEventsService does nothing when the relay is unavailable', async () => {
  const store = new StubStore();
  const relay = new StubRelay();
  relay.unavailable = true;
  relay.events = [makeEvent()];
  const service = new PaymentEventsService(store, relay);

  const summary = await service.pollPaymentEvents();

  assert.deepEqual(summary, { fetched: 0, applied: 0, acknowledged: 0 });
  assert.deepEqual(store.appliedEvents, []);
});
