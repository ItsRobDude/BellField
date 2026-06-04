import { JobCostingRepository } from './job-costing.repository';

// Scripted databaseService (no real DB): records queries and echoes an inserted row back to
// getById, so we can pin the SQL shape insertReversal/listEventsForJob/isEventReversed emit.
function createRepository() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let listRows: unknown[] = [];
  let reversedRowCount = 0;

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });

    if (/from jobs where id = \$1\s+for update/i.test(sql)) {
      // The cost-write lock: default to a writable (open) job so inserts proceed.
      return { rows: [{ status: 'inProgress' }] };
    }
    if (/insert into job_cost_events/i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    if (/where reversal_of_event_id = \$1/i.test(sql)) {
      return { rows: [], rowCount: reversedRowCount };
    }
    if (/from job_cost_events\s+where job_id = \$1/i.test(sql)) {
      return { rows: listRows };
    }
    if (/from job_cost_events where id = \$1/i.test(sql)) {
      // Echo the most recent insert as the persisted row.
      const insert = [...calls].reverse().find((c) => /insert into job_cost_events/i.test(c.sql));
      const p = (insert?.params ?? []) as unknown[];
      return {
        rows: [
          {
            id: p[0],
            jobId: p[1],
            kind: p[2],
            description: p[3],
            amount: p[4],
            hours: p[5],
            ratePerHour: p[6],
            reversalOfEventId: p[7],
            actorName: p[9],
            occurredAt: p[10]
          }
        ]
      };
    }
    return { rows: [] };
  });

  // The insert now runs inside a transaction (lock the job row, then write); route the
  // transaction's queryable back through the same scripted query handler.
  const databaseService = {
    query,
    transaction: jest.fn(async (work: (q: unknown) => unknown) => work({ query }))
  };

  const repository = new JobCostingRepository(databaseService as never);
  return {
    repository,
    calls,
    setListRows: (rows: unknown[]) => {
      listRows = rows;
    },
    setReversed: (reversed: boolean) => {
      reversedRowCount = reversed ? 1 : 0;
    }
  };
}

const actor = { id: 'emp-1', displayName: 'Olivia Owner' };
const INSERT = /insert into job_cost_events/i;

describe('JobCostingRepository.insertReversal', () => {
  it('writes a labor reversal: negated amount, carried hours/rate, reversal link', async () => {
    const { repository, calls } = createRepository();

    const event = await repository.insertReversal({
      jobId: 'job-1',
      kind: 'labor',
      description: 'Reversal of: Install labor',
      amount: -190,
      hours: 2,
      ratePerHour: 95,
      reversalOfEventId: 'evt-1',
      actor
    });

    const insert = calls.find((c) => INSERT.test(c.sql));
    // params: [id, jobId, kind, description, amount, hours, ratePerHour, reversalOfEventId, ...]
    expect(insert?.params[2]).toBe('labor');
    expect(insert?.params[4]).toBe(-190);
    expect(insert?.params[5]).toBe(2);
    expect(insert?.params[6]).toBe(95);
    expect(insert?.params[7]).toBe('evt-1');
    expect(event.amount).toBe(-190);
    expect(event.reversalOfEventId).toBe('evt-1');
  });

  it('writes an expense reversal with null labor provenance', async () => {
    const { repository, calls } = createRepository();

    await repository.insertReversal({
      jobId: 'job-1',
      kind: 'expense',
      description: 'Reversal of: Permit',
      amount: -50,
      hours: null,
      ratePerHour: null,
      reversalOfEventId: 'evt-2',
      actor
    });

    const insert = calls.find((c) => INSERT.test(c.sql));
    expect(insert?.params[2]).toBe('expense');
    expect(insert?.params[4]).toBe(-50);
    expect(insert?.params[5]).toBeNull();
    expect(insert?.params[6]).toBeNull();
    expect(insert?.params[7]).toBe('evt-2');
  });
});

describe('JobCostingRepository.isEventReversed', () => {
  it('is true when a reversal points at the event, false otherwise', async () => {
    const { repository, setReversed } = createRepository();
    setReversed(true);
    expect(await repository.isEventReversed('evt-1')).toBe(true);
    setReversed(false);
    expect(await repository.isEventReversed('evt-1')).toBe(false);
  });
});

describe('JobCostingRepository.listEventsForJob', () => {
  it('maps rows including the reversal link', async () => {
    const { repository, setListRows } = createRepository();
    setListRows([
      {
        id: 'rev-1',
        jobId: 'job-1',
        kind: 'labor',
        description: 'Reversal of: Install labor',
        amount: '-190.00',
        hours: '2.00',
        ratePerHour: '95.00',
        reversalOfEventId: 'evt-1',
        actorName: 'Olivia Owner',
        occurredAt: '2026-06-02T00:00:00.000Z'
      }
    ]);

    const events = await repository.listEventsForJob('job-1');

    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(-190);
    expect(events[0].reversalOfEventId).toBe('evt-1');
  });
});
