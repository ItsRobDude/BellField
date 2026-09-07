import { Client, type QueryResult, type QueryResultRow } from 'pg';
import { BookkeepingRepository } from './bookkeeping.repository';

const databaseUrl = process.env.BELLFIELD_API_DB_TEST_DATABASE_URL?.trim();
const canRunDbSpecs = Boolean(databaseUrl);

if (!canRunDbSpecs && process.env.CI === 'true') {
  throw new Error(
    'BELLFIELD_API_DB_TEST_DATABASE_URL must be set in CI so bookkeeping worklist SQL is exercised against PostgreSQL.'
  );
}

const describeDb = canRunDbSpecs ? describe : describe.skip;

describeDb('BookkeepingRepository worklist paging with PostgreSQL', () => {
  let client: Client;
  let repository: BookkeepingRepository;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    // Temp tables shadow the real ones for this session and carry only the columns the
    // worklist SQL reads.
    await client.query(`
      create temp table customers (
        id text primary key,
        name text not null
      );
      create temp table jobs (
        id text primary key,
        job_number text not null,
        bill_to_customer_id text not null
      );
      create temp table invoices (
        id text primary key,
        job_id text not null,
        invoice_kind text not null default 'main',
        status text not null default 'draft',
        total_amount numeric(12, 2) not null default 0,
        posted_at timestamptz,
        updated_at timestamptz not null
      );
      create temp table invoice_line_items (
        id text primary key,
        invoice_id text not null,
        is_void boolean not null default false
      );
      create temp table payments (
        id text primary key,
        job_id text not null,
        amount numeric(12, 2) not null,
        method text not null,
        received_at timestamptz not null,
        is_void boolean not null default false
      );
      create temp table payment_refunds (
        id text primary key,
        job_id text not null,
        amount numeric(12, 2) not null
      );
    `);
    repository = new BookkeepingRepository({
      query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) =>
        client.query<T>(text, values as never[] | undefined) as Promise<QueryResult<T>>
    } as never);
  });

  beforeEach(async () => {
    await client.query(
      'truncate table customers, jobs, invoices, invoice_line_items, payments, payment_refunds'
    );
    await client.query(`insert into customers (id, name) values ('cust-1', 'Acme')`);
  });

  afterAll(async () => {
    await client?.end();
  });

  async function seedJob(jobId: string): Promise<void> {
    await client.query(
      `insert into jobs (id, job_number, bill_to_customer_id) values ($1, $2, 'cust-1')`,
      [jobId, jobId.toUpperCase()]
    );
  }

  async function seedInvoice(input: {
    id: string;
    jobId: string;
    status: 'draft' | 'posted';
    kind?: 'main' | 'adjustment' | 'credit';
    total: number;
    postedAt?: string;
    updatedAt: string;
    withLine?: boolean;
  }): Promise<void> {
    await client.query(
      `insert into invoices (id, job_id, invoice_kind, status, total_amount, posted_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.jobId,
        input.kind ?? 'main',
        input.status,
        input.total,
        input.postedAt ?? null,
        input.updatedAt
      ]
    );

    if (input.withLine) {
      await client.query(
        `insert into invoice_line_items (id, invoice_id, is_void) values ($1, $2, false)`,
        [`${input.id}-line`, input.id]
      );
    }
  }

  async function seedPayment(input: {
    id: string;
    jobId: string;
    amount: number;
    method?: string;
    receivedAt?: string;
    isVoid?: boolean;
  }): Promise<void> {
    await client.query(
      `insert into payments (id, job_id, amount, method, received_at, is_void)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        input.id,
        input.jobId,
        input.amount,
        input.method ?? 'check',
        input.receivedAt ?? '2026-06-08T12:00:00.000Z',
        input.isVoid ?? false
      ]
    );
  }

  it('pages ready-to-post drafts oldest first by (updated_at, id) without skips or repeats', async () => {
    await seedJob('job-1');
    await seedInvoice({
      id: 'inv-b',
      jobId: 'job-1',
      status: 'draft',
      total: 20,
      updatedAt: '2026-06-01T10:00:00.000Z',
      withLine: true
    });
    await seedInvoice({
      id: 'inv-a',
      jobId: 'job-1',
      status: 'draft',
      total: 10,
      updatedAt: '2026-06-01T10:00:00.000Z',
      withLine: true
    });
    await seedInvoice({
      id: 'inv-c',
      jobId: 'job-1',
      status: 'draft',
      total: 30,
      updatedAt: '2026-06-01T11:00:00.000Z',
      withLine: true
    });
    // Excluded: a draft with no active line and a posted invoice.
    await seedInvoice({
      id: 'inv-empty',
      jobId: 'job-1',
      status: 'draft',
      total: 0,
      updatedAt: '2026-06-01T09:00:00.000Z'
    });
    await seedInvoice({
      id: 'inv-posted',
      jobId: 'job-1',
      status: 'posted',
      total: 99,
      postedAt: '2026-06-01T09:30:00.000Z',
      updatedAt: '2026-06-01T09:30:00.000Z',
      withLine: true
    });

    const firstPage = await repository.listReadyToPost({ limit: 2 });
    expect(firstPage.map((item) => item.invoiceId)).toEqual(['inv-a', 'inv-b']);

    const lastOnPage = firstPage[firstPage.length - 1];
    const secondPage = await repository.listReadyToPost({
      limit: 2,
      cursor: { updatedAt: lastOnPage.updatedAt, id: lastOnPage.invoiceId }
    });
    expect(secondPage.map((item) => item.invoiceId)).toEqual(['inv-c']);
    expect(await repository.countReadyToPost()).toBe(3);
  });

  it('pages recently posted invoices newest first by (posted_at, id)', async () => {
    await seedJob('job-1');
    await seedInvoice({
      id: 'inv-p1',
      jobId: 'job-1',
      status: 'posted',
      total: 10,
      postedAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-02T12:00:00.000Z'
    });
    await seedInvoice({
      id: 'inv-p2',
      jobId: 'job-1',
      status: 'posted',
      total: 20,
      postedAt: '2026-06-02T11:00:00.000Z',
      updatedAt: '2026-06-02T11:00:00.000Z'
    });
    await seedInvoice({
      id: 'inv-p3',
      jobId: 'job-1',
      status: 'posted',
      total: 30,
      postedAt: '2026-06-02T11:00:00.000Z',
      updatedAt: '2026-06-02T11:00:00.000Z'
    });
    await seedInvoice({
      id: 'inv-draft',
      jobId: 'job-1',
      status: 'draft',
      total: 5,
      updatedAt: '2026-06-02T13:00:00.000Z',
      withLine: true
    });

    const firstPage = await repository.listRecentlyPosted({ limit: 2 });
    expect(firstPage.map((item) => item.invoiceId)).toEqual(['inv-p1', 'inv-p3']);

    const lastOnPage = firstPage[firstPage.length - 1];
    const secondPage = await repository.listRecentlyPosted({
      limit: 2,
      cursor: { postedAt: lastOnPage.postedAt ?? '', id: lastOnPage.invoiceId }
    });
    expect(secondPage.map((item) => item.invoiceId)).toEqual(['inv-p2']);
    expect(await repository.countRecentlyPosted()).toBe(3);
  });

  it('pages open balances highest first by (amount_due, job_id), counting refunds and ties', async () => {
    for (const jobId of ['job-1', 'job-2', 'job-3', 'job-4', 'job-5']) {
      await seedJob(jobId);
    }
    const postedAt = '2026-06-03T12:00:00.000Z';
    // job-1: billed 300, paid 100 -> 200 due. job-2: billed 200 -> 200 due (ties with job-1).
    await seedInvoice({
      id: 'inv-1',
      jobId: 'job-1',
      status: 'posted',
      total: 300,
      postedAt,
      updatedAt: postedAt
    });
    await seedPayment({ id: 'pay-1', jobId: 'job-1', amount: 100 });
    await seedInvoice({
      id: 'inv-2',
      jobId: 'job-2',
      status: 'posted',
      total: 200,
      postedAt,
      updatedAt: postedAt
    });
    // job-3: billed 500, paid 500, refunded 50 -> 50 due.
    await seedInvoice({
      id: 'inv-3',
      jobId: 'job-3',
      status: 'posted',
      total: 500,
      postedAt,
      updatedAt: postedAt
    });
    await seedPayment({ id: 'pay-3', jobId: 'job-3', amount: 500 });
    await client.query(
      `insert into payment_refunds (id, job_id, amount) values ('refund-3', 'job-3', 50)`
    );
    // job-4: fully paid -> excluded. job-5: draft only -> excluded.
    await seedInvoice({
      id: 'inv-4',
      jobId: 'job-4',
      status: 'posted',
      total: 100,
      postedAt,
      updatedAt: postedAt
    });
    await seedPayment({ id: 'pay-4', jobId: 'job-4', amount: 100 });
    await seedInvoice({
      id: 'inv-5',
      jobId: 'job-5',
      status: 'draft',
      total: 400,
      updatedAt: postedAt,
      withLine: true
    });

    const firstPage = await repository.listOpenBalances({ limit: 2 });
    expect(firstPage.map((item) => [item.jobId, item.amountDue])).toEqual([
      ['job-2', 200],
      ['job-1', 200]
    ]);

    const lastOnPage = firstPage[firstPage.length - 1];
    const secondPage = await repository.listOpenBalances({
      limit: 2,
      cursor: { amountDue: lastOnPage.amountDue, jobId: lastOnPage.jobId }
    });
    expect(secondPage.map((item) => [item.jobId, item.amountDue])).toEqual([['job-3', 50]]);
    expect(await repository.countOpenBalances()).toBe(3);
  });

  it('pages payment batches by (batch date desc, method asc)', async () => {
    await seedJob('job-1');
    await seedPayment({
      id: 'pay-1',
      jobId: 'job-1',
      amount: 100,
      method: 'check',
      receivedAt: '2026-06-08T12:00:00.000Z'
    });
    await seedPayment({
      id: 'pay-2',
      jobId: 'job-1',
      amount: 150,
      method: 'check',
      receivedAt: '2026-06-08T13:00:00.000Z'
    });
    await seedPayment({
      id: 'pay-3',
      jobId: 'job-1',
      amount: 50,
      method: 'cash',
      receivedAt: '2026-06-08T12:00:00.000Z'
    });
    await seedPayment({
      id: 'pay-4',
      jobId: 'job-1',
      amount: 75,
      method: 'card',
      receivedAt: '2026-06-07T12:00:00.000Z'
    });
    await seedPayment({
      id: 'pay-void',
      jobId: 'job-1',
      amount: 999,
      method: 'ach',
      receivedAt: '2026-06-09T12:00:00.000Z',
      isVoid: true
    });

    const firstPage = await repository.listPaymentBatches({ limit: 2 });
    expect(firstPage.map((item) => [item.batchDate, item.method, item.totalAmount])).toEqual([
      ['2026-06-08', 'cash', 50],
      ['2026-06-08', 'check', 250]
    ]);

    const lastOnPage = firstPage[firstPage.length - 1];
    const secondPage = await repository.listPaymentBatches({
      limit: 2,
      cursor: { batchDate: lastOnPage.batchDate, method: lastOnPage.method }
    });
    expect(secondPage.map((item) => [item.batchDate, item.method, item.paymentCount])).toEqual([
      ['2026-06-07', 'card', 1]
    ]);
    expect(await repository.countPaymentBatches()).toBe(3);
  });
});
