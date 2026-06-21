import { Client, type QueryResult, type QueryResultRow } from 'pg';
import { IdentityAccessRepository } from './identity-access.repository';

const databaseUrl = process.env.BELLFIELD_API_DB_TEST_DATABASE_URL?.trim();
const canRunDbSpecs = Boolean(databaseUrl);

if (!canRunDbSpecs && process.env.CI === 'true') {
  throw new Error(
    'BELLFIELD_API_DB_TEST_DATABASE_URL must be set in CI so identity repository SQL is exercised against PostgreSQL.'
  );
}

const describeDb = canRunDbSpecs ? describe : describe.skip;

describeDb('IdentityAccessRepository identity attempts with PostgreSQL', () => {
  let client: Client;
  let repository: IdentityAccessRepository;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      create temp table identity_login_attempts (
        bucket_key text primary key,
        failed_count integer not null default 0 check (failed_count >= 0),
        window_started_at timestamptz not null,
        last_failed_at timestamptz not null,
        blocked_until timestamptz,
        updated_at timestamptz not null default now()
      )
    `);
    repository = new IdentityAccessRepository({
      query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) =>
        client.query<T>(text, values as never[] | undefined) as Promise<QueryResult<T>>
    } as never);
  });

  beforeEach(async () => {
    await client.query('truncate table identity_login_attempts');
  });

  afterAll(async () => {
    await client?.end();
  });

  it('inserts the first failed attempt without blocking', async () => {
    const occurredAt = '2026-06-19T12:00:00.000Z';

    const state = await repository.recordFailedIdentityAttempt({
      bucketKey: 'setup:first-owner',
      occurredAt,
      windowCutoff: '2026-06-19T11:45:00.000Z',
      failureThreshold: 3,
      blockedUntil: '2026-06-19T12:05:00.000Z'
    });

    expect(state).toEqual({
      failedCount: 1,
      windowStartedAt: occurredAt,
      lastFailedAt: occurredAt,
      blockedUntil: undefined
    });
  });

  it('increments repeated failures and writes the threshold block timestamp', async () => {
    await recordAttempt({
      occurredAt: '2026-06-19T12:00:00.000Z',
      windowCutoff: '2026-06-19T11:45:00.000Z',
      blockedUntil: '2026-06-19T12:05:00.000Z'
    });
    const second = await recordAttempt({
      occurredAt: '2026-06-19T12:01:00.000Z',
      windowCutoff: '2026-06-19T11:46:00.000Z',
      blockedUntil: '2026-06-19T12:06:00.000Z'
    });
    const third = await recordAttempt({
      occurredAt: '2026-06-19T12:02:00.000Z',
      windowCutoff: '2026-06-19T11:47:00.000Z',
      blockedUntil: '2026-06-19T12:07:00.000Z'
    });

    expect(second).toMatchObject({
      failedCount: 2,
      blockedUntil: undefined
    });
    expect(third).toEqual({
      failedCount: 3,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:02:00.000Z',
      blockedUntil: '2026-06-19T12:07:00.000Z'
    });
  });

  it('resets the counter and clears blocking after the attempt window expires', async () => {
    await recordAttempt({
      occurredAt: '2026-06-19T12:00:00.000Z',
      windowCutoff: '2026-06-19T11:45:00.000Z',
      blockedUntil: '2026-06-19T12:05:00.000Z'
    });

    const reset = await recordAttempt({
      occurredAt: '2026-06-19T12:20:00.000Z',
      windowCutoff: '2026-06-19T12:05:00.000Z',
      blockedUntil: '2026-06-19T12:25:00.000Z'
    });

    expect(reset).toEqual({
      failedCount: 1,
      windowStartedAt: '2026-06-19T12:20:00.000Z',
      lastFailedAt: '2026-06-19T12:20:00.000Z',
      blockedUntil: undefined
    });
  });

  function recordAttempt(input: {
    occurredAt: string;
    windowCutoff: string;
    blockedUntil: string;
  }) {
    return repository.recordFailedIdentityAttempt({
      bucketKey: 'setup:first-owner',
      occurredAt: input.occurredAt,
      windowCutoff: input.windowCutoff,
      failureThreshold: 3,
      blockedUntil: input.blockedUntil
    });
  }
});
