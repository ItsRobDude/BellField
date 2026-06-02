import { ConflictException } from '@nestjs/common';
import { applyAdjustment, applyTransfer, getOnHandSnapshot } from './inventory-ledger-utils';
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

const actor = { id: 'emp-1', displayName: 'Ivy Inventory' };
const SNAPSHOT = /coalesce\(sum\(quantity\), 0\) as qty/i;
const INSERT = /insert into inventory_movements/i;
const LOCK = /pg_advisory_xact_lock/i;

describe('getOnHandSnapshot', () => {
  it('computes quantity, total value, and weighted-average cost', async () => {
    const { queryable } = scriptedQueryable([{ match: SNAPSHOT, rows: [{ qty: 10, value: 125 }] }]);
    const snap = await getOnHandSnapshot(queryable, 'item-1', 'loc-1');
    expect(snap.quantity).toBe(10);
    expect(snap.totalValue).toBe(125);
    expect(snap.averageUnitCost).toBe(12.5);
  });

  it('reports zero average when nothing is on hand', async () => {
    const { queryable } = scriptedQueryable([{ match: SNAPSHOT, rows: [{ qty: 0, value: 0 }] }]);
    const snap = await getOnHandSnapshot(queryable, 'item-1', 'loc-1');
    expect(snap.averageUnitCost).toBe(0);
  });
});

describe('applyAdjustment', () => {
  it('locks the (item,location), then inserts a gain at the supplied unit cost', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 0, value: 0 }] },
      { match: INSERT, rowCount: 1 }
    ]);

    await applyAdjustment(queryable, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantityDelta: 5,
      unitCost: 8,
      actor,
      occurredAt: '2026-06-02T00:00:00.000Z'
    });

    expect(findCalls(calls, LOCK)).toHaveLength(1);
    const insert = findCalls(calls, INSERT)[0];
    expect(insert.params).toContain('adjustmentGain');
    expect(insert.params).toContain(5); // quantity
    expect(insert.params).toContain(8); // unit cost
  });

  it('requires a unit cost for a gain onto empty stock (no average to fall back on)', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 0, value: 0 }] }
    ]);

    await expect(
      applyAdjustment(queryable, {
        itemId: 'item-1',
        locationId: 'loc-1',
        quantityDelta: 5,
        actor,
        occurredAt: '2026-06-02T00:00:00.000Z'
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(findCalls(calls, INSERT)).toHaveLength(0);
  });

  it('values a loss at the current average', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 10, value: 125 }] }, // avg 12.5
      { match: INSERT, rowCount: 1 }
    ]);

    await applyAdjustment(queryable, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantityDelta: -2,
      actor,
      occurredAt: '2026-06-02T00:00:00.000Z'
    });

    const insert = findCalls(calls, INSERT)[0];
    expect(insert.params).toContain('adjustmentLoss');
    expect(insert.params).toContain(-2);
    expect(insert.params).toContain(12.5);
  });

  it('rejects a loss that would drive on-hand negative', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 1, value: 12.5 }] }
    ]);

    await expect(
      applyAdjustment(queryable, {
        itemId: 'item-1',
        locationId: 'loc-1',
        quantityDelta: -5,
        actor,
        occurredAt: '2026-06-02T00:00:00.000Z'
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findCalls(calls, INSERT)).toHaveLength(0);
  });
});

describe('applyTransfer', () => {
  it('writes two legs carrying the source average cost', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 10, value: 125 }] }, // source avg 12.5
      { match: INSERT, rowCount: 1 }
    ]);

    await applyTransfer(queryable, {
      itemId: 'item-1',
      fromLocationId: 'loc-from',
      toLocationId: 'loc-to',
      quantity: 4,
      actor,
      occurredAt: '2026-06-02T00:00:00.000Z'
    });

    const inserts = findCalls(calls, INSERT);
    expect(inserts).toHaveLength(2);
    // out leg has negative qty, in leg positive; both at avg 12.5
    expect(inserts[0].params).toContain(-4);
    expect(inserts[1].params).toContain(4);
    expect(inserts[0].params).toContain(12.5);
    expect(inserts[1].params).toContain(12.5);
    // both locks taken
    expect(findCalls(calls, LOCK)).toHaveLength(2);
  });

  it('fully depletes mixed-cost stock with no value residual', async () => {
    // 1 unit @ $1 + 2 units @ $2 = 3 units worth $5 (avg 1.6667). Transferring all 3 must
    // remove EXACTLY $5 (extended_cost), not 3 * rounded-avg, so the source zeroes out.
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 3, value: 5 }] },
      { match: INSERT, rowCount: 1 }
    ]);

    await applyTransfer(queryable, {
      itemId: 'item-1',
      fromLocationId: 'loc-from',
      toLocationId: 'loc-to',
      quantity: 3,
      actor,
      occurredAt: '2026-06-02T00:00:00.000Z'
    });

    const inserts = findCalls(calls, INSERT);
    // extended_cost is the 6th value: out leg -5 exactly, in leg +5 exactly.
    expect(inserts[0].params[5]).toBe(-5);
    expect(inserts[1].params[5]).toBe(5);
  });

  it('rejects an over-transfer (more than on hand at source)', async () => {
    const { queryable, calls } = scriptedQueryable([
      { match: LOCK, rows: [] },
      { match: SNAPSHOT, rows: [{ qty: 3, value: 30 }] }
    ]);

    await expect(
      applyTransfer(queryable, {
        itemId: 'item-1',
        fromLocationId: 'loc-from',
        toLocationId: 'loc-to',
        quantity: 5,
        actor,
        occurredAt: '2026-06-02T00:00:00.000Z'
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findCalls(calls, INSERT)).toHaveLength(0);
  });
});
