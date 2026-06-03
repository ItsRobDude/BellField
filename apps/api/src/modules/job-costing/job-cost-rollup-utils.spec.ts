import {
  computeJobCostRollup,
  freezeJobCostSnapshot,
  getCurrentJobCostSnapshot,
  supersedeCurrentJobCostSnapshot
} from './job-cost-rollup-utils';
import type { QueryExecutor } from '../../database/database.service';

function scriptedQueryable(
  handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryable: QueryExecutor = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const handler = handlers.find((h) => h.match.test(sql));
      return { rows: handler?.rows ?? [], rowCount: handler?.rowCount ?? 0 };
    }) as QueryExecutor['query']
  };
  return { queryable, calls };
}

function findCall(calls: Array<{ sql: string; params: unknown[] }>, fragment: RegExp) {
  return calls.find((c) => fragment.test(c.sql));
}

const INVENTORY = /from inventory_movements/i;
const EVENTS = /from job_cost_events/i;
const SNAP_INSERT = /insert into job_cost_snapshots/i;
const SNAP_UPDATE = /update job_cost_snapshots set superseded_at/i;
const SNAP_SELECT = /from job_cost_snapshots/i;

describe('computeJobCostRollup', () => {
  it('sums inventory material plus labor and expense events', async () => {
    const { queryable } = scriptedQueryable([
      { match: INVENTORY, rows: [{ material: 150 }] },
      {
        match: EVENTS,
        rows: [
          { kind: 'labor', total: 200 },
          { kind: 'expense', total: 50 }
        ]
      }
    ]);

    const rollup = await computeJobCostRollup(queryable, 'job-1');

    expect(rollup).toEqual({
      materialCost: 150,
      laborCost: 200,
      expenseCost: 50,
      totalCost: 400
    });
  });

  it('returns zeros for a job with no cost activity', async () => {
    const { queryable } = scriptedQueryable([
      { match: INVENTORY, rows: [{ material: 0 }] },
      { match: EVENTS, rows: [] }
    ]);

    const rollup = await computeJobCostRollup(queryable, 'job-1');

    expect(rollup).toEqual({ materialCost: 0, laborCost: 0, expenseCost: 0, totalCost: 0 });
  });
});

describe('supersedeCurrentJobCostSnapshot', () => {
  it('retires the current snapshot for the job', async () => {
    const { queryable, calls } = scriptedQueryable([{ match: SNAP_UPDATE, rowCount: 1 }]);

    await supersedeCurrentJobCostSnapshot(queryable, 'job-1', '2026-06-02T00:00:00.000Z');

    const update = findCall(calls, SNAP_UPDATE);
    expect(update?.params).toEqual(['job-1', '2026-06-02T00:00:00.000Z']);
  });
});

describe('freezeJobCostSnapshot', () => {
  it('supersedes the prior snapshot, then inserts a frozen rollup', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: SNAP_UPDATE, rowCount: 1 },
      { match: INVENTORY, rows: [{ material: 150 }] },
      { match: EVENTS, rows: [{ kind: 'labor', total: 200 }] },
      { match: SNAP_INSERT, rowCount: 1 }
    ]);

    await freezeJobCostSnapshot(queryable, 'job-1', 'Olivia Owner', '2026-06-02T00:00:00.000Z');

    // Supersede must run before the insert (one current snapshot per job).
    const updateIndex = calls.findIndex((c) => SNAP_UPDATE.test(c.sql));
    const insertIndex = calls.findIndex((c) => SNAP_INSERT.test(c.sql));
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(updateIndex);

    const insert = findCall(calls, SNAP_INSERT);
    // insert params: [id, jobId, material, labor, expense, total, actorName, occurredAt, createdAt]
    expect(insert?.params[1]).toBe('job-1');
    expect(insert?.params[2]).toBe(150); // material
    expect(insert?.params[3]).toBe(200); // labor
    expect(insert?.params[4]).toBe(0); // expense (none)
    expect(insert?.params[5]).toBe(350); // total
    expect(insert?.params[6]).toBe('Olivia Owner');
  });
});

describe('getCurrentJobCostSnapshot', () => {
  it('maps the current snapshot row to dollars rounded to cents', async () => {
    const { queryable } = scriptedQueryable([
      {
        match: SNAP_SELECT,
        rows: [
          {
            id: 'snap-1',
            material: '150.0000',
            labor: '200.0000',
            expense: '50.0000',
            total: '400.0000',
            createdByName: 'Olivia Owner',
            occurredAt: '2026-06-02T00:00:00.000Z'
          }
        ]
      }
    ]);

    const snapshot = await getCurrentJobCostSnapshot(queryable, 'job-1');

    expect(snapshot).toEqual({
      id: 'snap-1',
      materialCost: 150,
      laborCost: 200,
      expenseCost: 50,
      totalCost: 400,
      createdByName: 'Olivia Owner',
      occurredAt: '2026-06-02T00:00:00.000Z'
    });
  });

  it('returns null when the job has no current snapshot', async () => {
    const { queryable } = scriptedQueryable([{ match: SNAP_SELECT, rows: [] }]);
    expect(await getCurrentJobCostSnapshot(queryable, 'job-1')).toBeNull();
  });
});
