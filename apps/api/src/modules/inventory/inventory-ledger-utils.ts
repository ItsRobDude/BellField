import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { InventoryMovementKind } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';

// Shared inventory-ledger primitives. These run INSIDE a caller's transaction (they
// take a QueryExecutor), so receiving (purchasing) and issue-to-job (job costing) can
// reuse the same movement/valuation logic cross-module without importing another
// module's repository — the same pattern as the invoice reflection utils.
//
// Valuation (v1): weighted-average cost per (item, location). On-hand value =
// SUM(extended_cost); on-hand qty = SUM(quantity); each movement carries a signed
// extended_cost (its value delta). Outbound movements remove the exact proportional
// value at the current average — a full depletion removes the exact remainder — so the
// average is stable and history is never rewritten.

export type LedgerActor = { id: string; displayName: string };

export type MovementSourceKind = 'purchaseReceipt' | 'adjustment' | 'transfer' | 'issue' | 'return';

export type MovementInsert = {
  itemId: string;
  kind: InventoryMovementKind;
  quantity: number; // signed relative to locationId
  unitCost: number;
  /** Signed value delta at the location (4-decimal). Source of truth for on-hand value. */
  extendedCost: number;
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
  /** Precise running value (sum of extended_cost) at 4 decimals. */
  totalValue: number;
  averageUnitCost: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Value precision for the ledger: 4 decimals (hundredths of a cent) to avoid drift. */
function roundValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundQty(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * The value to remove for an outbound quantity, valued at the current average. A FULL
 * depletion removes the exact remaining value (no rounding residual); a partial removes
 * the proportional value at 4-decimal precision. Returns a positive number.
 */
export function outboundValue(snapshot: OnHandSnapshot, quantityOut: number): number {
  if (quantityOut >= snapshot.quantity) {
    return snapshot.totalValue;
  }
  return roundValue((snapshot.totalValue * quantityOut) / snapshot.quantity);
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
    `select coalesce(sum(quantity), 0) as qty, coalesce(sum(extended_cost), 0) as value
     from inventory_movements
     where item_id = $1 and location_id = $2`,
    [itemId, locationId]
  );
  const quantity = roundQty(Number(result.rows[0]?.qty ?? 0));
  const totalValue = roundValue(Number(result.rows[0]?.value ?? 0));
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
       id, item_id, kind, quantity, unit_cost, extended_cost, location_id, job_id,
       source_kind, source_id, transfer_group_id, reversal_of_movement_id,
       actor_employee_id, actor_name, note, occurred_at, created_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id,
      movement.itemId,
      movement.kind,
      movement.quantity,
      movement.unitCost,
      movement.extendedCost,
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
  // A gain onto empty stock has no average to fall back on, so it must state a unit cost
  // — otherwise it would silently create zero-value stock and understate job cost later.
  if (isGain && input.unitCost === undefined && snapshot.quantity <= 0) {
    throw new BadRequestException(
      'A unit cost is required when adding stock to an empty location.'
    );
  }
  const unitCost = isGain
    ? roundMoney(input.unitCost ?? snapshot.averageUnitCost)
    : snapshot.averageUnitCost;
  // Gain adds qty*cost; loss removes the exact proportional value (full = exact remainder).
  const extendedCost = isGain
    ? roundValue(input.quantityDelta * unitCost)
    : -outboundValue(snapshot, -input.quantityDelta);
  await insertMovement(queryable, {
    itemId: input.itemId,
    kind: isGain ? 'adjustmentGain' : 'adjustmentLoss',
    quantity: input.quantityDelta,
    unitCost,
    extendedCost,
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
  // Value removed from source = value added to destination (cost travels exactly).
  const movedValue = outboundValue(source, input.quantity);
  const unitCost = source.averageUnitCost;
  const transferGroupId = randomUUID();

  await insertMovement(queryable, {
    itemId: input.itemId,
    kind: 'transfer',
    quantity: -input.quantity,
    unitCost,
    extendedCost: -movedValue,
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
    extendedCost: movedValue,
    locationId: input.toLocationId,
    sourceKind: 'transfer',
    transferGroupId,
    actor: input.actor,
    note: input.note ?? null,
    occurredAt: input.occurredAt
  });
}
