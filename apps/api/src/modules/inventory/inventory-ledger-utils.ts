import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { InventoryMovementKind } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';

// Shared inventory-ledger primitives. These run INSIDE a caller's transaction (they
// take a QueryExecutor), so receiving (purchasing) and issue-to-job (job costing) can
// reuse the same movement/valuation logic cross-module without importing another
// module's repository — the same pattern as the invoice reflection utils.
//
// Valuation (v1): weighted-average cost per (item, location). On-hand value =
// SUM(quantity * unit_cost); on-hand qty = SUM(quantity). Outbound movements are
// valued at the current average so the average is stable and history is never rewritten.

export type LedgerActor = { id: string; displayName: string };

export type MovementSourceKind = 'purchaseReceipt' | 'adjustment' | 'transfer' | 'issue' | 'return';

export type MovementInsert = {
  itemId: string;
  kind: InventoryMovementKind;
  quantity: number; // signed relative to locationId
  unitCost: number;
  locationId?: string | null;
  jobId?: string | null;
  sourceKind?: MovementSourceKind | null;
  sourceId?: string | null;
  transferGroupId?: string | null;
  reversalOfMovementId?: string | null;
  actor: LedgerActor;
  note?: string | null;
  occurredAt: string;
};

export type OnHandSnapshot = {
  quantity: number;
  totalValue: number;
  averageUnitCost: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQty(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Serialize concurrent writers on a single (item, location) so on-hand can't be raced. */
export async function lockItemLocation(
  queryable: QueryExecutor,
  itemId: string,
  locationId: string
): Promise<void> {
  await queryable.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    itemId,
    locationId
  ]);
}

/** Current derived on-hand for one (item, location). */
export async function getOnHandSnapshot(
  queryable: QueryExecutor,
  itemId: string,
  locationId: string
): Promise<OnHandSnapshot> {
  const result = await queryable.query<{ qty: string | number; value: string | number }>(
    `select coalesce(sum(quantity), 0) as qty, coalesce(sum(quantity * unit_cost), 0) as value
     from inventory_movements
     where item_id = $1 and location_id = $2`,
    [itemId, locationId]
  );
  const quantity = roundQty(Number(result.rows[0]?.qty ?? 0));
  const totalValue = roundMoney(Number(result.rows[0]?.value ?? 0));
  const averageUnitCost = quantity > 0 ? roundMoney(totalValue / quantity) : 0;
  return { quantity, totalValue, averageUnitCost };
}

/** Append one immutable movement row. Returns its id. */
export async function insertMovement(
  queryable: QueryExecutor,
  movement: MovementInsert
): Promise<string> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await queryable.query(
    `insert into inventory_movements (
       id, item_id, kind, quantity, unit_cost, location_id, job_id,
       source_kind, source_id, transfer_group_id, reversal_of_movement_id,
       actor_employee_id, actor_name, note, occurred_at, created_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      movement.itemId,
      movement.kind,
      movement.quantity,
      movement.unitCost,
      movement.locationId ?? null,
      movement.jobId ?? null,
      movement.sourceKind ?? null,
      movement.sourceId ?? null,
      movement.transferGroupId ?? null,
      movement.reversalOfMovementId ?? null,
      movement.actor.id,
      movement.actor.displayName,
      movement.note ?? null,
      movement.occurredAt,
      createdAt
    ]
  );
  return id;
}

/**
 * Adjust on-hand at a location. Positive delta = gain (valued at the supplied cost, or
 * the current average), negative = loss (valued at the current average). Rejects an
 * adjustment that would drive on-hand negative. Must run inside a transaction.
 */
export async function applyAdjustment(
  queryable: QueryExecutor,
  input: {
    itemId: string;
    locationId: string;
    quantityDelta: number;
    unitCost?: number;
    actor: LedgerActor;
    note?: string;
    occurredAt: string;
  }
): Promise<void> {
  await lockItemLocation(queryable, input.itemId, input.locationId);
  const snapshot = await getOnHandSnapshot(queryable, input.itemId, input.locationId);
  if (input.quantityDelta < 0 && snapshot.quantity + input.quantityDelta < 0) {
    throw new ConflictException('Adjustment would drive on-hand below zero.');
  }
  const isGain = input.quantityDelta > 0;
  const unitCost = isGain
    ? roundMoney(input.unitCost ?? snapshot.averageUnitCost)
    : snapshot.averageUnitCost;
  await insertMovement(queryable, {
    itemId: input.itemId,
    kind: isGain ? 'adjustmentGain' : 'adjustmentLoss',
    quantity: input.quantityDelta,
    unitCost,
    locationId: input.locationId,
    sourceKind: 'adjustment',
    actor: input.actor,
    note: input.note ?? null,
    occurredAt: input.occurredAt
  });
}

/**
 * Move stock between two locations as two movements sharing a transfer group; cost
 * travels with the goods at the source's current average. Rejects an over-transfer.
 * Must run inside a transaction.
 */
export async function applyTransfer(
  queryable: QueryExecutor,
  input: {
    itemId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    actor: LedgerActor;
    note?: string;
    occurredAt: string;
  }
): Promise<void> {
  // Lock both (item, location) pairs in a deterministic order to avoid deadlocks.
  const ordered = [input.fromLocationId, input.toLocationId].sort();
  await lockItemLocation(queryable, input.itemId, ordered[0]);
  if (ordered[1] !== ordered[0]) {
    await lockItemLocation(queryable, input.itemId, ordered[1]);
  }

  const source = await getOnHandSnapshot(queryable, input.itemId, input.fromLocationId);
  if (source.quantity < input.quantity) {
    throw new ConflictException('Not enough on hand at the source location to transfer.');
  }
  const unitCost = source.averageUnitCost;
  const transferGroupId = randomUUID();

  await insertMovement(queryable, {
    itemId: input.itemId,
    kind: 'transfer',
    quantity: -input.quantity,
    unitCost,
    locationId: input.fromLocationId,
    sourceKind: 'transfer',
    transferGroupId,
    actor: input.actor,
    note: input.note ?? null,
    occurredAt: input.occurredAt
  });
  await insertMovement(queryable, {
    itemId: input.itemId,
    kind: 'transfer',
    quantity: input.quantity,
    unitCost,
    locationId: input.toLocationId,
    sourceKind: 'transfer',
    transferGroupId,
    actor: input.actor,
    note: input.note ?? null,
    occurredAt: input.occurredAt
  });
}
