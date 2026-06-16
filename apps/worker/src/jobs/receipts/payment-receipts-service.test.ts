import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaymentReceiptsService } from './payment-receipts-service';
import type {
  DueReceipt,
  ExpiredReceipt,
  PaymentReceiptStore,
  ReceiptRecipient,
  ReceiptSendOutcome,
  ReceiptSettings,
  ReceiptTimelineEntry
} from './receipt-types';

const FIXED_NOW = new Date('2026-06-16T12:00:00Z');

function defaultSettings(overrides?: Partial<ReceiptSettings>): ReceiptSettings {
  return {
    companyName: 'Acme HVAC',
    replyToEmail: 'office@acme.example',
    sendPaymentReceipts: true,
    paymentReceiptEmailSubject: 'Receipt from {companyName}',
    paymentReceiptEmailBody:
      'Hello {customerName}, we received your {receiptKind} of {amount} by {method} on {date} for job {jobNumber}.',
    ...overrides
  };
}

function makeDue(overrides?: Partial<DueReceipt>): DueReceipt {
  return {
    id: 'rcpt-1',
    kind: 'paymentReceipt',
    jobId: 'job-1',
    amount: '100.00',
    currency: 'USD',
    method: 'card',
    purpose: 'payment',
    occurredAt: new Date('2026-06-15T09:00:00Z'),
    attemptCount: 0,
    recipientEmail: null,
    subject: null,
    bodyText: null,
    ...overrides
  };
}

type Recorded = {
  pinned: { id: string; recipientEmail: string; subject: string; bodyText: string }[];
  sent: { id: string; providerMessageId: string | null }[];
  failed: { id: string; error: string }[];
  retried: { id: string; nextAttemptAt: Date }[];
  canceled: string[];
  timeline: ReceiptTimelineEntry[];
};

class FakeStore implements PaymentReceiptStore {
  due: DueReceipt[];
  expired: ExpiredReceipt[];
  settings: ReceiptSettings;
  recipient: ReceiptRecipient;
  resolveCalls = 0;
  recorded: Recorded = {
    pinned: [],
    sent: [],
    failed: [],
    retried: [],
    canceled: [],
    timeline: []
  };

  constructor(input: {
    due?: DueReceipt[];
    expired?: ExpiredReceipt[];
    settings?: ReceiptSettings;
    recipient?: ReceiptRecipient;
  }) {
    this.due = input.due ?? [];
    this.expired = input.expired ?? [];
    this.settings = input.settings ?? defaultSettings();
    this.recipient = input.recipient ?? {
      email: 'homeowner@example.com',
      customerName: 'Dana Homeowner',
      jobNumber: 'J-1001'
    };
  }

  async claimDueQueued(): Promise<DueReceipt[]> {
    return this.due;
  }
  async loadSettings(): Promise<ReceiptSettings> {
    return this.settings;
  }
  async resolveRecipient(): Promise<ReceiptRecipient> {
    this.resolveCalls += 1;
    return this.recipient;
  }
  async pinRendered(
    id: string,
    fields: { recipientEmail: string; subject: string; bodyText: string }
  ): Promise<void> {
    this.recorded.pinned.push({ id, ...fields });
  }
  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    this.recorded.sent.push({ id, providerMessageId });
  }
  async scheduleRetry(id: string, nextAttemptAt: Date): Promise<void> {
    this.recorded.retried.push({ id, nextAttemptAt });
  }
  async markFailed(id: string, error: string): Promise<void> {
    this.recorded.failed.push({ id, error });
  }
  async cancel(id: string): Promise<void> {
    this.recorded.canceled.push(id);
  }
  async expireDue(): Promise<ExpiredReceipt[]> {
    return this.expired;
  }
  async addTimelineEntry(entry: ReceiptTimelineEntry): Promise<void> {
    this.recorded.timeline.push(entry);
  }
}

function fakeRelay(outcome: ReceiptSendOutcome) {
  const calls: { recipientEmail: string; subject: string; bodyText: string; fromName: string }[] =
    [];
  return {
    calls,
    client: {
      async sendReceiptMessage(input: {
        recipientEmail: string;
        subject: string;
        bodyText: string;
        fromName: string;
      }): Promise<ReceiptSendOutcome> {
        calls.push({
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          bodyText: input.bodyText,
          fromName: input.fromName
        });
        return outcome;
      }
    }
  };
}

function service(store: PaymentReceiptStore, relay: { sendReceiptMessage: unknown }) {
  return new PaymentReceiptsService(store, relay as never, { now: () => FIXED_NOW });
}

test('sends a fresh receipt: resolves, renders tokens, pins, marks sent, logs timeline', async () => {
  const store = new FakeStore({ due: [makeDue()] });
  const relay = fakeRelay({ kind: 'sent', relayMessageId: 'relay-1' });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.sent, 1);
  assert.equal(relay.calls.length, 1);
  assert.equal(relay.calls[0].recipientEmail, 'homeowner@example.com');
  assert.equal(relay.calls[0].fromName, 'Acme HVAC');
  assert.equal(relay.calls[0].subject, 'Receipt from Acme HVAC');
  assert.equal(
    relay.calls[0].bodyText,
    'Hello Dana Homeowner, we received your payment of $100.00 by Card on June 15, 2026 for job J-1001.'
  );
  assert.equal(store.recorded.pinned.length, 1);
  assert.equal(store.recorded.sent[0]?.providerMessageId, 'relay-1');
  assert.equal(store.recorded.timeline[0]?.kind, 'paymentReceiptSent');
});

test('renders deposit receipts with the deposit kind token', async () => {
  const store = new FakeStore({ due: [makeDue({ purpose: 'deposit', method: 'check' })] });
  const relay = fakeRelay({ kind: 'sent' });
  await service(store, relay.client).processDueReceipts();

  assert.match(relay.calls[0].bodyText, /your deposit of \$100\.00 by Check/);
});

test('no email on file: marks failed with an office timeline, never calls the relay', async () => {
  const store = new FakeStore({
    due: [makeDue()],
    recipient: { email: null, customerName: 'Dana', jobNumber: 'J-1001' }
  });
  const relay = fakeRelay({ kind: 'sent' });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.failed, 1);
  assert.equal(relay.calls.length, 0);
  assert.equal(store.recorded.failed[0]?.error, 'noRecipientEmail');
  assert.equal(store.recorded.timeline[0]?.kind, 'paymentReceiptFailed');
  assert.match(store.recorded.timeline[0]?.message ?? '', /no email address on file/i);
});

test('receipts disabled: cancels the row without sending', async () => {
  const store = new FakeStore({
    due: [makeDue()],
    settings: defaultSettings({ sendPaymentReceipts: false })
  });
  const relay = fakeRelay({ kind: 'sent' });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.canceled, 1);
  assert.equal(relay.calls.length, 0);
  assert.deepEqual(store.recorded.canceled, ['rcpt-1']);
});

test('retryable failure reschedules without a terminal timeline', async () => {
  const store = new FakeStore({ due: [makeDue()] });
  const relay = fakeRelay({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.rescheduled, 1);
  assert.equal(store.recorded.retried.length, 1);
  assert.equal(store.recorded.failed.length, 0);
  assert.equal(store.recorded.timeline.length, 0);
});

test('non-retryable failure marks failed with a timeline', async () => {
  const store = new FakeStore({ due: [makeDue()] });
  const relay = fakeRelay({ kind: 'failed', code: 'deliveryRejected', retryable: false });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.failed, 1);
  assert.equal(store.recorded.failed[0]?.error, 'deliveryRejected');
  assert.equal(store.recorded.timeline[0]?.kind, 'paymentReceiptFailed');
});

test('a retry reuses the pinned recipient and copy without re-resolving or re-rendering', async () => {
  const store = new FakeStore({
    due: [
      makeDue({
        attemptCount: 1,
        recipientEmail: 'pinned@example.com',
        subject: 'Pinned subject',
        bodyText: 'Pinned body'
      })
    ]
  });
  const relay = fakeRelay({ kind: 'sent' });
  await service(store, relay.client).processDueReceipts();

  assert.equal(store.resolveCalls, 0);
  assert.equal(store.recorded.pinned.length, 0);
  assert.equal(relay.calls[0].recipientEmail, 'pinned@example.com');
  assert.equal(relay.calls[0].subject, 'Pinned subject');
  assert.equal(relay.calls[0].bodyText, 'Pinned body');
});

test('expired queued receipts get an office failure timeline', async () => {
  const store = new FakeStore({
    expired: [{ id: 'rcpt-old', jobId: 'job-9', kind: 'paymentReceipt' }]
  });
  const relay = fakeRelay({ kind: 'sent' });
  const summary = await service(store, relay.client).processDueReceipts();

  assert.equal(summary.expired, 1);
  assert.equal(store.recorded.timeline[0]?.kind, 'paymentReceiptFailed');
  assert.match(store.recorded.timeline[0]?.message ?? '', /expired/i);
});
