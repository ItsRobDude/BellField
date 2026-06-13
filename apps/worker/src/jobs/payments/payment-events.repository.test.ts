import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import type { QueryExecutor, TransactionalQueryExecutor } from '../../common/database';
import type { RelayPaymentEvent } from '../delivery/delivery-types';
import { PaymentEventsRepository } from './payment-events.repository';

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
}

function makeEvent(overrides?: Partial<RelayPaymentEvent>): RelayPaymentEvent {
  return {
    paymentEventId: 'event-1',
    paymentSessionId: 'session-1',
    jobRef: 'job-1',
    invoiceRef: 'inv-main',
    provider: 'stripe',
    providerPaymentId: 'pi_123',
    providerSessionId: 'cs_123',
    amountCents: 17_500,
    currency: 'usd',
    applicationFeeCents: 175,
    processorFeeCents: 538,
    paidAt: '2026-06-13T12:00:00.000Z',
    ...overrides
  };
}

test('PaymentEventsRepository records a provider payment and allocates it across posted charges', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: 'inv-main', amountCents: 17_500, currency: 'USD' }],
    [{ id: 'job-1' }],
    [],
    [],
    [
      { invoiceId: 'inv-main', invoiceKind: 'main', total: '125.00', allocated: '0.00' },
      { invoiceId: 'inv-adj', invoiceKind: 'adjustment', total: '50.00', allocated: '0.00' }
    ],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);
  const occurredAt = new Date('2026-06-13T12:00:10.000Z');

  const outcome = await repository.applyRelayPaymentEvent(makeEvent(), occurredAt);

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.ok(paymentInsert);
  assert.match(paymentInsert.text, /'bellfield_payments'/);
  assert.match(paymentInsert.text, /'stripe'/);
  assert.equal(paymentInsert.values?.[1], 'job-1');
  assert.equal(paymentInsert.values?.[2], 'inv-main');
  assert.equal(paymentInsert.values?.[3], '175.00');
  assert.equal(paymentInsert.values?.[4], 'USD');
  assert.equal(paymentInsert.values?.[6], 'Stripe pi_123');
  assert.equal(paymentInsert.values?.[7], '5.38');
  assert.equal(paymentInsert.values?.[8], '1.75');
  assert.equal(paymentInsert.values?.[9], 'pi_123');
  assert.equal(paymentInsert.values?.[10], 'cs_123');

  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].values?.[2], 'inv-main');
  assert.equal(allocations[0].values?.[3], '125.00');
  assert.equal(allocations[1].values?.[2], 'inv-adj');
  assert.equal(allocations[1].values?.[3], '50.00');

  const sessionUpdate = database.queries.find((query) =>
    /update online_payment_sessions/i.test(query.text)
  );
  assert.deepEqual(sessionUpdate?.values?.slice(0, 2), ['session-1', paymentInsert.values?.[0]]);
});

test('PaymentEventsRepository records an overpayment in full and surfaces the unallocated remainder', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: 'inv-main', amountCents: 20_000, currency: 'USD' }],
    [{ id: 'job-1' }],
    [],
    [],
    // Only $125 is still due, but the customer paid $200 (balance moved after
    // the link was created).
    [{ invoiceId: 'inv-main', invoiceKind: 'main', total: '125.00', allocated: '0.00' }],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ amountCents: 20_000 }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  // The full confirmed amount is recorded (the money is real)...
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[3], '200.00');
  // ...only $125 is allocated to the open charge...
  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].values?.[3], '125.00');
  // ...and the $75 remainder is surfaced, not silent.
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /\$75\.00 exceeds the balance due/);
});

test('PaymentEventsRepository records a confirmation with no local session and flags it', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [], // no online_payment_sessions row
    [{ id: 'job-1' }],
    [],
    [],
    [],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ invoiceRef: 'inv-on-another-job' }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  // Falls back to the relay-echoed job, but invoice_id is null — never the
  // untrusted event.invoiceRef that could belong to a different job.
  assert.equal(paymentInsert?.values?.[1], 'job-1');
  assert.equal(paymentInsert?.values?.[2], null);
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /No local payment-link record/);
});

test('PaymentEventsRepository records a local session amount mismatch and flags it', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: 'inv-main', amountCents: 10_000, currency: 'USD' }],
    [{ id: 'job-1' }],
    [],
    [],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent(),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[1], 'job-1');
  assert.equal(paymentInsert?.values?.[2], null);
  assert.equal(paymentInsert?.values?.[3], '175.00');
  const sessionUpdate = database.queries.find((query) =>
    /update online_payment_sessions/i.test(query.text)
  );
  assert.deepEqual(sessionUpdate?.values?.slice(0, 2), ['session-1', paymentInsert?.values?.[0]]);
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /payment-link record did not match/);
});

test('PaymentEventsRepository records a local session currency mismatch and flags it', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: 'inv-main', amountCents: 17_500, currency: 'CAD' }],
    [{ id: 'job-1' }],
    [],
    [],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent(),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[2], null);
  assert.equal(paymentInsert?.values?.[4], 'USD');
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /payment-link record did not match/);
});

test('PaymentEventsRepository treats an existing provider payment as already applied', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [[{ id: 'payment-1' }]];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(makeEvent(), new Date());

  assert.equal(outcome, 'alreadyApplied');
  assert.equal(
    database.queries.some((query) => /insert into payments/i.test(query.text)),
    false
  );
  const sessionUpdate = database.queries.find((query) =>
    /update online_payment_sessions/i.test(query.text)
  );
  assert.deepEqual(sessionUpdate?.values?.slice(0, 2), ['session-1', 'payment-1']);
});
