import { ConflictException } from '@nestjs/common';
import { InventoryRepository } from './inventory.repository';
import type { QueryExecutor } from '../../database/database.service';

function scriptedRepository(jobStatus: string | null = 'inProgress') {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  const queryable: QueryExecutor = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (JOB_LOCK.test(sql)) {
        return { rows: jobStatus ? [{ status: jobStatus }] : [] };
      }
      // applyIssueToJob part-only guard: the issued item is an active part.
      if (/from inventory_items\s+where id = \$1/i.test(sql)) {
        return { rows: [{ kind: 'part', isActive: true }] };
      }
      if (/pg_advisory_xact_lock/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/coalesce\(sum\(quantity\)/i.test(sql)) {
        return { rows: [{ qty: '5', value: '100' }] };
      }
      if (MOVEMENT_INSERT.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    }) as unknown as QueryExecutor['query']
  };

  const databaseService = {
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never,
    query: queryable.query
  };

  return { repository: new InventoryRepository(databaseService as never), calls };
}

const JOB_LOCK = /from jobs where id = \$1\s+for update/i;
const ITEM_LOCATION_LOCK = /pg_advisory_xact_lock/i;
const MOVEMENT_INSERT = /insert into inventory_movements/i;

const issue = {
  itemId: 'item-1',
  locationId: 'loc-1',
  jobId: 'job-1',
  quantity: 2,
  actor: { id: 'emp-1', displayName: 'Ivy Inventory' }
};

describe('InventoryRepository.recordIssueToJob', () => {
  it('locks the job row before locking stock and writing the issue movement', async () => {
    const { repository, calls } = scriptedRepository();

    await repository.recordIssueToJob(issue);

    const jobLockIndex = calls.findIndex((c) => JOB_LOCK.test(c.sql));
    const itemLocationLockIndex = calls.findIndex((c) => ITEM_LOCATION_LOCK.test(c.sql));
    const movementIndex = calls.findIndex((c) => MOVEMENT_INSERT.test(c.sql));

    expect(jobLockIndex).toBeGreaterThanOrEqual(0);
    expect(itemLocationLockIndex).toBeGreaterThan(jobLockIndex);
    expect(movementIndex).toBeGreaterThan(itemLocationLockIndex);
    expect(calls[jobLockIndex].params).toEqual(['job-1']);
    expect(calls[movementIndex].params[2]).toBe('issueToJob');
    expect(calls[movementIndex].params[7]).toBe('job-1');
  });

  it('rejects a final job under the transaction lock before touching stock', async () => {
    const { repository, calls } = scriptedRepository('completed');

    await expect(repository.recordIssueToJob(issue)).rejects.toThrow(ConflictException);

    expect(calls.some((c) => ITEM_LOCATION_LOCK.test(c.sql))).toBe(false);
    expect(calls.some((c) => MOVEMENT_INSERT.test(c.sql))).toBe(false);
  });
});

describe('InventoryRepository.listTruckStockForEmployee', () => {
  function scriptedTruckStock(rows: unknown[]) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows };
    }) as unknown as QueryExecutor['query'];
    const databaseService = { query } as never;
    return { repository: new InventoryRepository(databaseService), calls };
  }

  it('scopes the query to the employee and maps qty without exposing cost', async () => {
    const { repository, calls } = scriptedTruckStock([
      {
        itemId: 'item-1',
        sku: 'CAP-45',
        itemName: 'Capacitor 45uF',
        unitOfMeasure: 'each',
        locationId: 'truck-1',
        locationName: 'Truck 1',
        quantity: '4'
      }
    ]);

    const items = await repository.listTruckStockForEmployee('emp-9');

    expect(calls[0].params).toEqual(['emp-9']);
    expect(calls[0].sql).toMatch(/loc\.kind = 'truck'/);
    expect(calls[0].sql).toMatch(/it\.kind = 'part'/);
    expect(calls[0].sql).toMatch(/having sum\(m\.quantity\) > 0/);
    // The field device must never receive company cost data.
    expect(calls[0].sql).not.toMatch(/extended_cost/);
    expect(items).toEqual([
      {
        itemId: 'item-1',
        sku: 'CAP-45',
        itemName: 'Capacitor 45uF',
        unitOfMeasure: 'each',
        locationId: 'truck-1',
        locationName: 'Truck 1',
        quantityOnHand: 4
      }
    ]);
    expect(items[0]).not.toHaveProperty('averageUnitCost');
  });

  it('maps null sku/unit to undefined', async () => {
    const { repository } = scriptedTruckStock([
      {
        itemId: 'item-2',
        sku: null,
        itemName: 'Generic Fuse',
        unitOfMeasure: null,
        locationId: 'truck-1',
        locationName: 'Truck 1',
        quantity: '2'
      }
    ]);

    const [item] = await repository.listTruckStockForEmployee('emp-9');

    expect(item.sku).toBeUndefined();
    expect(item.unitOfMeasure).toBeUndefined();
    expect(item.quantityOnHand).toBe(2);
  });
});
