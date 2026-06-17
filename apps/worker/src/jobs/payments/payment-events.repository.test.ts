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

function findReceiptEnqueue(database: CapturingDatabase) {
  return database.queries.find((query) => /insert into payment_receipt_messages/i.test(query.text));
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
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-main',
        amountCents: 17_500,
        currency: 'USD',
        purpose: 'payment'
      }
    ],
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
  // A normal invoice session stamps the payment purpose from the session (not the default).
  assert.equal(paymentInsert.values?.[12], 'payment');

  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].values?.[2], 'inv-main');
  assert.equal(allocations[0].values?.[3], '125.00');
  assert.equal(allocations[1].values?.[2], 'inv-adj');
  assert.equal(allocations[1].values?.[3], '50.00');
  const balanceQuery = database.queries.find((query) => /from invoices i/i.test(query.text));
  assert.deepEqual(balanceQuery?.values, ['job-1', 'inv-main']);

  const sessionUpdate = database.queries.find((query) =>
    /update online_payment_sessions/i.test(query.text)
  );
  assert.deepEqual(sessionUpdate?.values?.slice(0, 2), ['session-1', paymentInsert.values?.[0]]);

  // A customer receipt is enqueued in the same transaction, keyed to the new
  // payment, with the recorded amount/purpose. occurred_at is Stripe's paid time
  // (paidAt); created_at is worker processing time (occurredAt).
  const receipt = findReceiptEnqueue(database);
  assert.ok(receipt);
  assert.match(receipt.text, /'paymentReceipt'/);
  assert.equal(receipt.values?.[2], paymentInsert.values?.[0]); // payment_id
  assert.equal(receipt.values?.[3], '175.00'); // amount (dollars)
  assert.equal(receipt.values?.[5], 'card'); // method
  assert.equal(receipt.values?.[6], 'payment'); // purpose
  assert.equal((receipt.values?.[7] as Date).getTime(), Date.parse('2026-06-13T12:00:00.000Z'));
  assert.equal((receipt.values?.[9] as Date).getTime(), occurredAt.getTime());
});

test('PaymentEventsRepository allocates an adjustment-scoped provider payment source-first', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-adj',
        amountCents: 17_500,
        currency: 'USD',
        purpose: 'payment'
      }
    ],
    [{ id: 'job-1' }],
    [],
    [],
    [
      { invoiceId: 'inv-adj', invoiceKind: 'adjustment', total: '50.00', allocated: '0.00' },
      { invoiceId: 'inv-main', invoiceKind: 'main', total: '125.00', allocated: '0.00' }
    ],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ invoiceRef: 'inv-adj' }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[2], 'inv-adj');
  const balanceQuery = database.queries.find((query) => /from invoices i/i.test(query.text));
  assert.deepEqual(balanceQuery?.values, ['job-1', 'inv-adj']);
  assert.match(
    String(balanceQuery?.text),
    /case when \$2::text is not null and i\.id = \$2 then 0 else 1 end/i
  );
  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].values?.[2], 'inv-adj');
  assert.equal(allocations[0].values?.[3], '50.00');
  assert.equal(allocations[1].values?.[2], 'inv-main');
  assert.equal(allocations[1].values?.[3], '125.00');
});

test('PaymentEventsRepository records an overpayment in full and surfaces the unallocated remainder', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-main',
        amountCents: 20_000,
        currency: 'USD',
        purpose: 'payment'
      }
    ],
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

test('PaymentEventsRepository allocates a provider re-payment after a refunded prior payment', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-main',
        amountCents: 10_000,
        currency: 'USD',
        purpose: 'payment'
      }
    ],
    [{ id: 'job-1' }],
    [],
    [],
    [{ invoiceId: 'inv-main', invoiceKind: 'main', total: '100.00', allocated: '0.00' }],
    [{ cents: 0 }],
    [{ cents: 10_000 }],
    [{ cents: 10_000 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ amountCents: 10_000 }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].values?.[2], 'inv-main');
  assert.equal(allocations[0].values?.[3], '100.00');

  const balanceQuery = database.queries.find((query) =>
    /payment_refund_allocations/i.test(query.text)
  );
  assert.ok(balanceQuery);
  assert.match(balanceQuery.text, /coalesce\(aa\.allocated, 0\) - coalesce\(ra\.refunded, 0\)/);
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.doesNotMatch(String(timeline?.values?.[3]), /exceeds the balance due/);
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
  // The customer still gets a receipt for the money actually recorded: event
  // amount, default purpose 'payment'.
  const receipt = findReceiptEnqueue(database);
  assert.ok(receipt);
  assert.equal(receipt.values?.[2], paymentInsert?.values?.[0]);
  assert.equal(receipt.values?.[3], '175.00');
  assert.equal(receipt.values?.[6], 'payment');
});

test('PaymentEventsRepository records a deposit session as unallocated job credit, stamped deposit', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: null, amountCents: 10_000, currency: 'USD', purpose: 'deposit' }],
    [{ id: 'job-1' }],
    [],
    [],
    [],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ amountCents: 10_000 }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[1], 'job-1');
  assert.equal(paymentInsert?.values?.[2], null);
  assert.equal(paymentInsert?.values?.[3], '100.00');
  // Durable purpose is carried from the session onto the payment row (last param).
  assert.equal(paymentInsert?.values?.[12], 'deposit');
  assert.equal(
    database.queries.some((query) => /insert into payment_allocations/i.test(query.text)),
    false
  );
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /Online deposit of \$100\.00 confirmed/);
  assert.match(String(timeline?.values?.[3]), /\$100\.00 exceeds the balance due/);
  // The receipt carries the deposit purpose so its copy reads as a deposit.
  const receipt = findReceiptEnqueue(database);
  assert.ok(receipt);
  assert.equal(receipt.values?.[3], '100.00');
  assert.equal(receipt.values?.[6], 'deposit');
});

test('PaymentEventsRepository defaults an out-of-band confirmation (no session) to payment purpose', async () => {
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
    makeEvent({ amountCents: 10_000 }),
    new Date()
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[12], 'payment');
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(String(timeline?.values?.[3]), /Online payment of/);
});

test('PaymentEventsRepository allocates a deposit session when posted charges exist', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [{ jobId: 'job-1', invoiceId: null, amountCents: 10_000, currency: 'USD', purpose: 'deposit' }],
    [{ id: 'job-1' }],
    [],
    [],
    [
      { invoiceId: 'inv-main', invoiceKind: 'main', total: '75.00', allocated: '0.00' },
      { invoiceId: 'inv-adj', invoiceKind: 'adjustment', total: '50.00', allocated: '0.00' }
    ],
    [{ cents: 0 }],
    [{ cents: 0 }],
    [{ cents: 0 }]
  ];
  const repository = new PaymentEventsRepository(database);

  const outcome = await repository.applyRelayPaymentEvent(
    makeEvent({ amountCents: 10_000, invoiceRef: null }),
    new Date('2026-06-13T12:00:10.000Z')
  );

  assert.equal(outcome, 'applied');
  const paymentInsert = database.queries.find((query) => /insert into payments/i.test(query.text));
  assert.equal(paymentInsert?.values?.[2], null);
  const allocations = database.queries.filter((query) =>
    /insert into payment_allocations/i.test(query.text)
  );
  assert.equal(allocations.length, 2);
  const balanceQuery = database.queries.find((query) => /from invoices i/i.test(query.text));
  assert.deepEqual(balanceQuery?.values, ['job-1', null]);
  assert.equal(allocations[0].values?.[2], 'inv-main');
  assert.equal(allocations[0].values?.[3], '75.00');
  assert.equal(allocations[1].values?.[2], 'inv-adj');
  assert.equal(allocations[1].values?.[3], '25.00');
  const timeline = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.doesNotMatch(String(timeline?.values?.[3]), /exceeds the balance due/);
});

test('PaymentEventsRepository records a local session amount mismatch and flags it', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-main',
        amountCents: 10_000,
        currency: 'USD',
        purpose: 'payment'
      }
    ],
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
  // The receipt matches the recorded (provider-confirmed) payment, not the
  // stale local session amount.
  const receipt = findReceiptEnqueue(database);
  assert.ok(receipt);
  assert.equal(receipt.values?.[3], '175.00');
  assert.equal(receipt.values?.[6], 'payment');
});

test('PaymentEventsRepository records a local session currency mismatch and flags it', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [],
    [
      {
        jobId: 'job-1',
        invoiceId: 'inv-main',
        amountCents: 17_500,
        currency: 'CAD',
        purpose: 'payment'
      }
    ],
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
  // Forward-only: a redelivery of an already-recorded payment never enqueues a
  // second receipt (and never retroactively receipts a pre-1b payment).
  assert.equal(findReceiptEnqueue(database), undefined);
  const sessionUpdate = database.queries.find((query) =>
    /update online_payment_sessions/i.test(query.text)
  );
  assert.deepEqual(sessionUpdate?.values?.slice(0, 2), ['session-1', 'payment-1']);
});
