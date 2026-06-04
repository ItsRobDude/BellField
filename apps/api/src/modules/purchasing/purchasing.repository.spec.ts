import { ConflictException } from '@nestjs/common';
import { PurchasingRepository } from './purchasing.repository';
import type { QueryExecutor } from '../../database/database.service';

// Scripted queryable: match each SQL by a fragment, return canned rows, record calls.
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

function repositoryWith(
  handlers: Array<{ match: RegExp; rows?: unknown[]; rowCount?: number }>,
  equipmentDataService: { createEquipmentWithinTransaction: jest.Mock }
) {
  const { queryable, calls } = scriptedQueryable(handlers);
  const databaseService = {
    transaction: (async (work: (q: QueryExecutor) => unknown) => work(queryable)) as never
  };
  const repository = new PurchasingRepository(
    databaseService as never,
    equipmentDataService as never
  );
  return { repository, calls };
}

const actor = { id: 'emp-1', displayName: 'Pat Purchaser' };
const PO_LOCK = /from purchase_orders where id = \$1\s+for update/i;
const JOB_LOCK = /from jobs where id = \$1\s+for update/i;
const LINES = /from purchase_order_lines where purchase_order_id/i;
const MOVEMENT_INSERT = /insert into inventory_movements/i;
const RECEIPT_INSERT = /insert into purchase_receipts/i;
const RECEIPT_LINE_INSERT = /insert into purchase_receipt_lines/i;
const PO_RECEIVED = /update purchase_orders set\s+status = 'received'/i;

describe('PurchasingRepository.receivePurchaseOrder', () => {
  it('receives a part to inventory: posts a receiveToInventory movement and marks the PO received', async () => {
    const equipmentDataService = { createEquipmentWithinTransaction: jest.fn() };
    const { repository, calls } = repositoryWith(
      [
        {
          match: PO_LOCK,
          rows: [
            { poNumber: 'PO-1', status: 'ordered', destInv: 'wh-1', destCust: null, jobId: null }
          ]
        },
        { match: /from inventory_locations where id = \$1/i, rows: [{ name: 'Main Warehouse' }] },
        {
          match: LINES,
          rows: [
            {
              id: 'line-1',
              itemId: 'item-1',
              kind: 'part',
              quantity: '5',
              expectedUnitCost: '8',
              eqType: null,
              eqBrand: null,
              eqModel: null,
              eqSerial: null
            }
          ]
        },
        { match: RECEIPT_INSERT, rowCount: 1 },
        { match: RECEIPT_LINE_INSERT, rowCount: 1 },
        { match: /pg_advisory_xact_lock/i, rows: [] },
        { match: MOVEMENT_INSERT, rowCount: 1 },
        { match: PO_RECEIVED, rowCount: 1 }
      ],
      equipmentDataService
    );

    await repository.receivePurchaseOrder('po-1', new Map(), undefined, actor);

    expect(findCalls(calls, RECEIPT_INSERT)).toHaveLength(1);
    const movement = findCalls(calls, MOVEMENT_INSERT)[0];
    // insertMovement params: [id, itemId, kind, quantity, unitCost, extendedCost, locationId, jobId, ...]
    expect(movement.params[2]).toBe('receiveToInventory');
    expect(movement.params[1]).toBe('item-1');
    expect(movement.params[3]).toBe(5);
    expect(movement.params[6]).toBe('wh-1'); // location
    expect(findCalls(calls, PO_RECEIVED)).toHaveLength(1);
    expect(equipmentDataService.createEquipmentWithinTransaction).not.toHaveBeenCalled();
  });

  it('receives equipment to a job: creates the asset via the equipment service and posts a receiveToJob cost movement', async () => {
    const equipmentDataService = {
      createEquipmentWithinTransaction: jest.fn().mockResolvedValue('equip-1')
    };
    const { repository, calls } = repositoryWith(
      [
        {
          match: PO_LOCK,
          rows: [
            {
              poNumber: 'PO-2',
              status: 'ordered',
              destInv: null,
              destCust: 'cust-1',
              jobId: 'job-1'
            }
          ]
        },
        // Cost-write lock on the job row: the PO is bound to a still-open job.
        { match: JOB_LOCK, rows: [{ status: 'inProgress' }] },
        {
          match: LINES,
          rows: [
            {
              id: 'line-1',
              itemId: 'equip-item',
              kind: 'equipment',
              quantity: '1',
              expectedUnitCost: '2200',
              eqType: 'Furnace',
              eqBrand: 'Carrier',
              eqModel: '59TP6',
              eqSerial: 'SN-1'
            }
          ]
        },
        { match: RECEIPT_INSERT, rowCount: 1 },
        { match: RECEIPT_LINE_INSERT, rowCount: 1 },
        { match: /update purchase_receipt_lines set created_equipment_id/i, rowCount: 1 },
        { match: MOVEMENT_INSERT, rowCount: 1 },
        { match: PO_RECEIVED, rowCount: 1 }
      ],
      equipmentDataService
    );

    await repository.receivePurchaseOrder('po-2', new Map(), undefined, actor);

    const jobLockIndex = calls.findIndex((c) => JOB_LOCK.test(c.sql));
    const receiptIndex = calls.findIndex((c) => RECEIPT_INSERT.test(c.sql));
    expect(jobLockIndex).toBeGreaterThanOrEqual(0);
    expect(receiptIndex).toBeGreaterThan(jobLockIndex);
    // The asset is created through the canonical equipment service, pendingInstall at the customer location.
    expect(equipmentDataService.createEquipmentWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'cust-1', status: 'pendingInstall' }),
      'Pat Purchaser',
      expect.anything(),
      expect.stringContaining('PO-2')
    );
    // Equipment cost posts to the job.
    const movement = findCalls(calls, MOVEMENT_INSERT)[0];
    expect(movement.params[2]).toBe('receiveToJob');
    expect(movement.params[7]).toBe('job-1'); // jobId
    expect(movement.params[1]).toBe('equip-item');
    expect(findCalls(calls, PO_RECEIVED)).toHaveLength(1);
  });

  it('does not post job cost for equipment received to inventory, even with a stray job id + item', async () => {
    // Defense-in-depth for the equipment branch: job cost only posts when the PO is
    // customer-destination (create + the DB constraint forbid a job on an inventory PO, but the
    // receive path must not double-count an asset as both stock and job cost regardless).
    const equipmentDataService = {
      createEquipmentWithinTransaction: jest.fn().mockResolvedValue('equip-3')
    };
    const { repository, calls } = repositoryWith(
      [
        {
          match: PO_LOCK,
          rows: [
            { poNumber: 'PO-4', status: 'ordered', destInv: 'wh-1', destCust: null, jobId: 'job-x' }
          ]
        },
        { match: JOB_LOCK, rows: [{ status: 'inProgress' }] },
        { match: /from inventory_locations where id = \$1/i, rows: [{ name: 'Main Warehouse' }] },
        {
          match: LINES,
          rows: [
            {
              id: 'line-1',
              itemId: 'equip-item',
              kind: 'equipment',
              quantity: '1',
              expectedUnitCost: '1800',
              eqType: 'Condenser',
              eqBrand: 'Trane',
              eqModel: 'XR14',
              eqSerial: 'SN-9'
            }
          ]
        },
        { match: RECEIPT_INSERT, rowCount: 1 },
        { match: RECEIPT_LINE_INSERT, rowCount: 1 },
        { match: /update purchase_receipt_lines set created_equipment_id/i, rowCount: 1 },
        { match: PO_RECEIVED, rowCount: 1 }
      ],
      equipmentDataService
    );

    await repository.receivePurchaseOrder('po-4', new Map(), undefined, actor);

    // Asset is created active at the inventory location; no receiveToJob movement is posted.
    expect(equipmentDataService.createEquipmentWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      'Pat Purchaser',
      expect.anything(),
      expect.stringContaining('PO-4')
    );
    expect(findCalls(calls, MOVEMENT_INSERT)).toHaveLength(0);
  });

  it('rejects a job-bound receipt when the job is final before receipt rows or movements are written', async () => {
    const equipmentDataService = {
      createEquipmentWithinTransaction: jest.fn().mockResolvedValue('equip-1')
    };
    const { repository, calls } = repositoryWith(
      [
        {
          match: PO_LOCK,
          rows: [
            {
              poNumber: 'PO-5',
              status: 'ordered',
              destInv: null,
              destCust: 'cust-1',
              jobId: 'job-1'
            }
          ]
        },
        { match: JOB_LOCK, rows: [{ status: 'completed' }] }
      ],
      equipmentDataService
    );

    await expect(
      repository.receivePurchaseOrder('po-5', new Map(), undefined, actor)
    ).rejects.toThrow(ConflictException);

    expect(findCalls(calls, JOB_LOCK)).toHaveLength(1);
    expect(findCalls(calls, RECEIPT_INSERT)).toHaveLength(0);
    expect(findCalls(calls, RECEIPT_LINE_INSERT)).toHaveLength(0);
    expect(findCalls(calls, MOVEMENT_INSERT)).toHaveLength(0);
    expect(findCalls(calls, PO_RECEIVED)).toHaveLength(0);
    expect(equipmentDataService.createEquipmentWithinTransaction).not.toHaveBeenCalled();
  });

  it('persists a serial captured on the receipt line, overriding the PO-line serial', async () => {
    const equipmentDataService = {
      createEquipmentWithinTransaction: jest.fn().mockResolvedValue('equip-2')
    };
    const { repository } = repositoryWith(
      [
        {
          match: PO_LOCK,
          rows: [
            { poNumber: 'PO-3', status: 'ordered', destInv: 'wh-1', destCust: null, jobId: null }
          ]
        },
        { match: /from inventory_locations where id = \$1/i, rows: [{ name: 'Main Warehouse' }] },
        {
          match: LINES,
          rows: [
            {
              id: 'line-1',
              itemId: null,
              kind: 'equipment',
              quantity: '1',
              expectedUnitCost: '900',
              eqType: 'Coil',
              eqBrand: 'Trane',
              eqModel: 'C1',
              eqSerial: 'PO-SERIAL'
            }
          ]
        },
        { match: RECEIPT_INSERT, rowCount: 1 },
        { match: RECEIPT_LINE_INSERT, rowCount: 1 },
        { match: /update purchase_receipt_lines set created_equipment_id/i, rowCount: 1 },
        { match: PO_RECEIVED, rowCount: 1 }
      ],
      equipmentDataService
    );

    const overrides = new Map([['line-1', { serialNumber: 'RECEIVED-SERIAL' }]]);
    await repository.receivePurchaseOrder('po-3', overrides, undefined, actor);

    // The receipt-line serial wins over the PO-line serial and is written to the asset,
    // which goes active at the inventory location.
    expect(equipmentDataService.createEquipmentWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ serialNumber: 'RECEIVED-SERIAL', status: 'active' }),
      'Pat Purchaser',
      expect.anything(),
      expect.stringContaining('PO-3')
    );
  });
});
