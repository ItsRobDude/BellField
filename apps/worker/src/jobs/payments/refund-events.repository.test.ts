import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import type { QueryExecutor, TransactionalQueryExecutor } from '../../common/database';
import type { RelayRefundEvent } from '../delivery/delivery-types';
import { RefundEventsRepository } from './refund-events.repository';

class CapturingDatabase implements TransactionalQueryExecutor {
  queries: Array<{ text: string; values?: unknown[] }> = [];
  rowQueue: QueryResultRow[][] = [];

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });
    const rows = this.rowQueue.length > 0 ? (this.rowQueue.shift() ?? []) : [];
    return {
      command: 'SELECT',
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows: rows as T[]
    };
  }

  async transaction<T>(callback: (queryable: QueryExecutor) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  find(fragment: RegExp) {
    return this.queries.find((query) => fragment.test(query.text));
  }

  filter(fragment: RegExp) {
    return this.queries.filter((query) => fragment.test(query.text));
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
    currency: 'usd',
    applicationFeeRefundedCents: 100,
    status: 'succeeded',
    failureReason: null,
    occurredAt: '2026-06-14T12:00:00.000Z',
    ...overrides
  };
}

const occurredAt = new Date('2026-06-14T12:00:05.000Z');

test('RefundEventsRepository writes a confirmed refund, reverses allocations, and advances the request', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [{ id: 'pay-1', jobId: 'job-1', amountCents: 10_000 }], // 2: original payment
    [{ id: 'job-1' }], // 3: lock job
    [], // 4: lock posted invoices
    [{ cents: 0 }], // 5: prior refunds on this payment
    [], // 6: insert payment_refunds
    [{ invoiceId: 'inv-main', allocatedCents: 10_000, refundedCents: 0 }], // 7: reversal source
    [], // 8: insert payment_refund_allocations
    [{ id: 'orr-1', jobId: 'job-1' }], // 9: find request by refund id
    [], // 10: update request -> succeeded
    [], // 11: update jobs
    [] // 12: insert timeline
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'applied');
  const refundInsert = database.find(/insert into payment_refunds/i);
  assert.ok(refundInsert);
  assert.match(refundInsert.text, /'bellfield_payments'/);
  assert.match(refundInsert.text, /'stripe'/);
  assert.equal(refundInsert.values?.[1], 'pay-1');
  assert.equal(refundInsert.values?.[2], 'job-1');
  assert.equal(refundInsert.values?.[3], '100.00');
  assert.equal(refundInsert.values?.[4], 'USD');
  assert.equal(refundInsert.values?.[5], 're_1');
  assert.equal(refundInsert.values?.[6], 'pi_1');
  assert.equal(refundInsert.values?.[7], '1.00');

  const allocations = database.filter(/insert into payment_refund_allocations/i);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].values?.[2], 'inv-main');
  assert.equal(allocations[0].values?.[3], '100.00');

  const requestUpdate = database.find(/update online_refund_requests/i);
  assert.match(requestUpdate?.text ?? '', /status = 'succeeded'/);

  const timeline = database.find(/insert into job_timeline_entries/i);
  assert.match(timeline?.text ?? '', /'paymentRefunded'/);
  assert.match(String(timeline?.values?.[3]), /Online refund of \$100\.00 confirmed/);

  // A refund receipt is enqueued in the same transaction, keyed to the refund.
  // occurred_at is Stripe's refund time; created_at is worker processing time.
  const receipt = database.find(/insert into payment_receipt_messages/i);
  assert.ok(receipt);
  assert.match(receipt.text, /'refundReceipt'/);
  assert.equal(receipt.values?.[2], refundInsert.values?.[0]); // payment_refund_id
  assert.equal(receipt.values?.[3], '100.00'); // amount
  assert.equal(receipt.values?.[5], 'card'); // method
  assert.equal((receipt.values?.[6] as Date).getTime(), Date.parse('2026-06-14T12:00:00.000Z'));
  assert.equal((receipt.values?.[8] as Date).getTime(), occurredAt.getTime());
});

test('RefundEventsRepository refunds a deposit (no allocations) — records the refund, reverses nothing', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [{ id: 'pay-1', jobId: 'job-1', amountCents: 10_000 }], // 2: the deposit payment
    [{ id: 'job-1' }], // 3: lock job
    [], // 4: lock posted invoices
    [{ cents: 0 }], // 5: prior refunds on this payment
    [], // 6: insert payment_refunds
    [], // 7: reversal source — EMPTY (a deposit held as credit has no allocations)
    [{ id: 'orr-1', jobId: 'job-1' }], // 8: find request by refund id
    [], // 9: update request -> succeeded
    [], // 10: update jobs
    [] // 11: insert timeline
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'applied');
  // The refund row is still written (net paid drops), but there is nothing to reverse.
  const refundInsert = database.find(/insert into payment_refunds/i);
  assert.ok(refundInsert);
  assert.equal(database.filter(/insert into payment_refund_allocations/i).length, 0);
  assert.match(database.find(/update online_refund_requests/i)?.text ?? '', /status = 'succeeded'/);

  const receipt = database.find(/insert into payment_receipt_messages/i);
  assert.ok(receipt);
  assert.match(receipt.text, /'refundReceipt'/);
  assert.equal(receipt.values?.[2], refundInsert.values?.[0]); // payment_refund_id
  assert.equal(receipt.values?.[3], '100.00');
});

test('RefundEventsRepository records a confirmed refund but flags one exceeding the remaining refundable', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [{ id: 'pay-1', jobId: 'job-1', amountCents: 10_000 }], // 2: $100 payment
    [{ id: 'job-1' }], // 3: lock job
    [], // 4: lock posted invoices
    [{ cents: 8_000 }], // 5: $80 already refunded -> only $20 remains refundable
    [], // 6: insert payment_refunds
    [{ invoiceId: 'inv-main', allocatedCents: 10_000, refundedCents: 8_000 }], // 7: reversal source
    [], // 8: insert payment_refund_allocations (reverses only the reversible $20)
    [{ id: 'orr-1', jobId: 'job-1' }], // 9: find request by refund id
    [], // 10: update request -> succeeded
    [], // 11: update jobs
    [] // 12: insert timeline
  ];
  const repository = new RefundEventsRepository(database);

  // The event refunds the full $100 even though only $20 is still refundable.
  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'applied');
  // The confirmed money is still recorded — never dropped...
  assert.ok(database.find(/insert into payment_refunds/i));
  // ...but the timeline flags the over-refund for the office to review.
  const timeline = database.find(/insert into job_timeline_entries/i);
  assert.match(String(timeline?.values?.[3]), /exceeds the amount still refundable/);
  // The receipt still goes out — the confirmed refund was recorded.
  assert.ok(database.find(/insert into payment_receipt_messages/i));
});

test('RefundEventsRepository is idempotent when the refund row already exists', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [{ id: 'existing-refund' }], // 1: refund dedup — already present
    [{ id: 'orr-1', jobId: 'job-1' }], // 2: reconcile find request by refund id
    [] // 3: update request -> succeeded
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'alreadyApplied');
  assert.equal(
    database.queries.some((query) => /insert into payment_refunds/i.test(query.text)),
    false
  );
  // A redelivery of an already-recorded refund never enqueues a second receipt.
  assert.equal(database.find(/insert into payment_receipt_messages/i), undefined);
});

test('RefundEventsRepository records a failed refund without writing a refund row', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [{ id: 'pay-1', jobId: 'job-1' }], // 2: payment (for the (payment,amount) fallback)
    [{ id: 'orr-1', jobId: 'job-1' }], // 3: find request by refund id
    [], // 4: update request -> failed
    [], // 5: update jobs
    [] // 6: insert timeline
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(
    makeEvent({ status: 'failed', failureReason: 'card_declined' }),
    occurredAt
  );

  assert.equal(outcome, 'failedRecorded');
  assert.equal(
    database.queries.some((query) => /insert into payment_refunds/i.test(query.text)),
    false
  );
  const requestUpdate = database.find(/update online_refund_requests/i);
  assert.match(requestUpdate?.text ?? '', /status = 'failed'/);
  const timeline = database.find(/insert into job_timeline_entries/i);
  assert.match(timeline?.text ?? '', /'paymentRefundFailed'/);
  // A failed refund moved no money — no customer receipt.
  assert.equal(database.find(/insert into payment_receipt_messages/i), undefined);
});

test('RefundEventsRepository defers a succeeded refund whose payment is not recorded yet', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [], // 2: payment — not recorded yet
    [], // 3: find request by refund id — none
    [{ id: 'orr-1', jobId: 'job-1' }], // 4: find request by relay request id
    [{ applyAttemptCount: 1 }] // 5: bump attempts (under bound)
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'deferred');
  assert.equal(
    database.queries.some((query) => /insert into payment_refunds/i.test(query.text)),
    false
  );
  const bump = database.find(/apply_attempt_count = apply_attempt_count \+ 1/i);
  assert.ok(bump);
  // A deferred refund has no recorded refund yet — no receipt.
  assert.equal(database.find(/insert into payment_receipt_messages/i), undefined);
});

test('RefundEventsRepository dead-letters a refund that defers past the bound', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [], // 2: payment — still not recorded
    [], // 3: find request by refund id — none
    [{ id: 'orr-1', jobId: 'job-1' }], // 4: find request by relay request id
    [{ applyAttemptCount: 2 }], // 5: bump attempts -> hits the injected bound of 2
    [], // 6: update request -> failed
    [], // 7: update jobs
    [] // 8: insert timeline
  ];
  const repository = new RefundEventsRepository(database, { maxApplyAttempts: 2 });

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'deadLettered');
  const failUpdate = database
    .filter(/update online_refund_requests/i)
    .find((query) => /status = 'failed'/.test(query.text));
  assert.ok(failUpdate);
  const timeline = database.find(/insert into job_timeline_entries/i);
  assert.match(timeline?.text ?? '', /'paymentRefundFailed'/);
  // A dead-lettered refund was never recorded — no customer receipt.
  assert.equal(database.find(/insert into payment_receipt_messages/i), undefined);
});

test('RefundEventsRepository reconciles the request by outstanding (payment, amount) when ids are missing', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [], // 1: refund dedup — none
    [{ id: 'pay-1', jobId: 'job-1', amountCents: 10_000 }], // 2: original payment
    [{ id: 'job-1' }], // 3: lock job
    [], // 4: lock posted invoices
    [{ cents: 0 }], // 5: prior refunds on this payment
    [], // 6: insert payment_refunds
    [{ invoiceId: 'inv-main', allocatedCents: 10_000, refundedCents: 0 }], // 7: reversal source
    [], // 8: insert payment_refund_allocations
    [], // 9: reconcile find by refund id — none (API timed out before storing it)
    [], // 10: reconcile find by relay request id — none
    [{ id: 'orr-1', jobId: 'job-1' }], // 11: reconcile find by outstanding (payment, amount)
    [], // 12: update request -> succeeded
    [], // 13: update jobs
    [] // 14: insert timeline
  ];
  const repository = new RefundEventsRepository(database);

  const outcome = await repository.applyRelayRefundEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'applied');
  const requestUpdate = database.find(/update online_refund_requests/i);
  assert.match(requestUpdate?.text ?? '', /status = 'succeeded'/);
  // The fallback lookup keyed on the outstanding (payment, amount) request ran.
  const fallbackLookup = database.find(/round\(amount \* 100\) = \$2 and status = 'requested'/i);
  assert.ok(fallbackLookup);

  const refundInsert = database.find(/insert into payment_refunds/i);
  assert.ok(refundInsert);
  const receipt = database.find(/insert into payment_receipt_messages/i);
  assert.ok(receipt);
  assert.match(receipt.text, /'refundReceipt'/);
  assert.equal(receipt.values?.[2], refundInsert.values?.[0]); // payment_refund_id
  assert.equal(receipt.values?.[3], '100.00');
});
