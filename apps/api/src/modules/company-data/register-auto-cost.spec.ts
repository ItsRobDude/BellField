import { autoCostStructuredPartLine, isSelfTruckPartRef } from './register-auto-cost';
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

function findCalls(calls: Array<{ sql: string; params: unknown[] }>, fragment: RegExp) {
  return calls.filter((c) => fragment.test(c.sql));
}

const actor = { id: 'emp-1', displayName: 'Tia Tech' };
const JOB_STATUS = /select status from jobs/i;
const LOCK = /pg_advisory_xact_lock/i;
const SNAPSHOT = /coalesce\(sum\(quantity\), 0\) as qty/i;
const MOVEMENT_INSERT = /insert into inventory_movements/i;
const REGISTER_UPDATE = /update register_entries\s+set costing_status = 'applied'/i;
const TIMELINE_INSERT = /insert into job_timeline_entries/i;

function baseInput() {
  return {
    registerEntryId: 'reg-1',
    jobId: 'job-1',
    kind: 'part' as const,
    itemId: 'item-1',
    locationId: 'loc-1',
    quantity: 2,
    description: 'Capacitor',
    actor,
    occurredAt: '2026-06-05T00:00:00.000Z'
  };
}

describe('autoCostStructuredPartLine', () => {
  it('issues from truck stock and flips the line to applied when on hand is sufficient', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: JOB_STATUS, rows: [{ status: 'inProgress' }] },
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 5, value: 50 }] },
      { match: MOVEMENT_INSERT, rowCount: 1 },
      { match: REGISTER_UPDATE, rowCount: 1 },
      { match: TIMELINE_INSERT, rowCount: 1 }
    ]);

    const result = await autoCostStructuredPartLine(queryable, baseInput());

    expect(result).toBe(true);
    const issue = findCalls(calls, MOVEMENT_INSERT)[0];
    expect(issue.params).toContain('issueToJob');
    expect(issue.params).toContain('reg-1'); // source_register_entry_id link
    expect(findCalls(calls, REGISTER_UPDATE)).toHaveLength(1);
    expect(findCalls(calls, TIMELINE_INSERT)).toHaveLength(1);
  });

  it('leaves the line untouched (no issue) when on hand is short', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: JOB_STATUS, rows: [{ status: 'inProgress' }] },
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 1, value: 10 }] }
    ]);

    const result = await autoCostStructuredPartLine(queryable, baseInput());

    expect(result).toBe(false);
    expect(findCalls(calls, MOVEMENT_INSERT)).toHaveLength(0);
    expect(findCalls(calls, REGISTER_UPDATE)).toHaveLength(0);
  });

  it('skips a finalized job without throwing (offline replay onto a closed job)', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: JOB_STATUS, rows: [{ status: 'completed' }] }
    ]);

    const result = await autoCostStructuredPartLine(queryable, baseInput());

    expect(result).toBe(false);
    expect(findCalls(calls, LOCK)).toHaveLength(0);
    expect(findCalls(calls, MOVEMENT_INSERT)).toHaveLength(0);
  });

  it('is a no-op for a non-part line', async () => {
    const { queryable, calls } = scriptedQueryable([]);

    const result = await autoCostStructuredPartLine(queryable, { ...baseInput(), kind: 'labor' });

    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('is a no-op when the structured item/location refs are absent', async () => {
    const { queryable, calls } = scriptedQueryable([]);

    const result = await autoCostStructuredPartLine(queryable, {
      ...baseInput(),
      itemId: undefined,
      locationId: undefined
    });

    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('isSelfTruckPartRef', () => {
  const VALIDATE = /from inventory_items it, inventory_locations loc/i;

  it("scopes the pair to an active part on the actor's own active truck", async () => {
    const { queryable, calls } = scriptedQueryable([{ match: VALIDATE, rows: [{ ok: 1 }] }]);

    const ok = await isSelfTruckPartRef(queryable, {
      itemId: 'item-1',
      locationId: 'truck-1',
      actorId: 'tech-7'
    });

    expect(ok).toBe(true);
    expect(calls[0].params).toEqual(['item-1', 'truck-1', 'tech-7']);
    expect(calls[0].sql).toMatch(/loc\.kind = 'truck'/);
    expect(calls[0].sql).toMatch(/it\.kind = 'part'/);
    expect(calls[0].sql).toMatch(/assigned_employee_id = \$3/);
    expect(calls[0].sql).toMatch(/is_active = true/);
  });

  it('returns false for a mismatch (foreign truck / inactive / stale id)', async () => {
    const { queryable } = scriptedQueryable([{ match: VALIDATE, rows: [] }]);

    const ok = await isSelfTruckPartRef(queryable, {
      itemId: 'item-1',
      locationId: 'warehouse-1',
      actorId: 'tech-7'
    });

    expect(ok).toBe(false);
  });
});
