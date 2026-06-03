import { randomUUID } from 'node:crypto';
import type { JobCostRollup, JobCostSnapshot } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';

// Shared job-cost primitives. Like inventory-ledger-utils, these run against a caller's
// QueryExecutor (a transaction OR the pool), so both the read model (job-costing) and the
// completion hook (company-data's job status change) reuse the same rollup + snapshot logic
// without crossing repository boundaries.
//
// The rollup sums a job's cost from three ledgers, all keyed by job_id:
//   * inventory material/equipment cost from inventory_movements — receiveToJob carries a
//     positive value (delivered straight to the job); issueToJob is negative at its stock
//     location, so the value delivered to the job is its negation.
//   * labor and expense from job_cost_events (amount; reversals are negative, so SUM nets).
// Stored at 4 decimals (matching inventory value precision); the read model rounds to cents.

/** Value precision: 4 decimals (hundredths of a cent) to avoid drift, like the ledger. */
function roundValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export async function computeJobCostRollup(
  queryable: QueryExecutor,
  jobId: string
): Promise<JobCostRollup> {
  // returnFromJob is a valid movement kind in the schema but has no writer in v1 (returns
  // are deferred). It is intentionally excluded here; when a return flow lands it should be
  // added as a negative job-material cost (and the snapshot/rollup tests updated with it).
  const inventory = await queryable.query<{ material: string | number }>(
    `select coalesce(sum(
        case kind
          when 'receiveToJob' then extended_cost
          when 'issueToJob' then -extended_cost
          else 0
        end
      ), 0) as material
     from inventory_movements
     where job_id = $1 and kind in ('receiveToJob', 'issueToJob')`,
    [jobId]
  );

  const events = await queryable.query<{ kind: string; total: string | number }>(
    `select kind, coalesce(sum(amount), 0) as total
     from job_cost_events
     where job_id = $1
     group by kind`,
    [jobId]
  );

  let laborCost = 0;
  let expenseCost = 0;
  for (const row of events.rows) {
    if (row.kind === 'labor') {
      laborCost = Number(row.total);
    } else if (row.kind === 'expense') {
      expenseCost = Number(row.total);
    }
  }

  const materialCost = roundValue(Number(inventory.rows[0]?.material ?? 0));
  laborCost = roundValue(laborCost);
  expenseCost = roundValue(expenseCost);
  const totalCost = roundValue(materialCost + laborCost + expenseCost);
  return { materialCost, laborCost, expenseCost, totalCost };
}

/** Retire the job's current (non-superseded) finalized snapshot, if any. */
export async function supersedeCurrentJobCostSnapshot(
  queryable: QueryExecutor,
  jobId: string,
  occurredAt: string
): Promise<void> {
  await queryable.query(
    `update job_cost_snapshots set superseded_at = $2
     where job_id = $1 and superseded_at is null`,
    [jobId, occurredAt]
  );
}

/**
 * Freeze the job's current cost rollup into a new finalized snapshot, first retiring any
 * existing current snapshot so at most one is current per job. Returns the new snapshot id.
 */
export async function freezeJobCostSnapshot(
  queryable: QueryExecutor,
  jobId: string,
  actorName: string,
  occurredAt: string
): Promise<string> {
  await supersedeCurrentJobCostSnapshot(queryable, jobId, occurredAt);
  const rollup = await computeJobCostRollup(queryable, jobId);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await queryable.query(
    `insert into job_cost_snapshots (
       id, job_id, material_cost, labor_cost, expense_cost, total_cost,
       created_by_name, occurred_at, created_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      jobId,
      rollup.materialCost,
      rollup.laborCost,
      rollup.expenseCost,
      rollup.totalCost,
      actorName,
      occurredAt,
      createdAt
    ]
  );
  return id;
}

/** The job's current finalized snapshot (rounded to cents for the wire), or null. */
export async function getCurrentJobCostSnapshot(
  queryable: QueryExecutor,
  jobId: string
): Promise<JobCostSnapshot | null> {
  const result = await queryable.query<{
    id: string;
    material: string | number;
    labor: string | number;
    expense: string | number;
    total: string | number;
    createdByName: string;
    occurredAt: string | Date;
  }>(
    `select id,
       material_cost as material, labor_cost as labor,
       expense_cost as expense, total_cost as total,
       created_by_name as "createdByName", occurred_at as "occurredAt"
     from job_cost_snapshots
     where job_id = $1 and superseded_at is null
     limit 1`,
    [jobId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    materialCost: roundMoney(Number(row.material)),
    laborCost: roundMoney(Number(row.labor)),
    expenseCost: roundMoney(Number(row.expense)),
    totalCost: roundMoney(Number(row.total)),
    createdByName: row.createdByName,
    occurredAt:
      row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt)
  };
}

/** Round a money value to whole cents for the wire/display boundary. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
