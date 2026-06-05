import { randomUUID } from 'node:crypto';
import type { JobStatus } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import {
  applyIssueToJob,
  getOnHandSnapshot,
  lockItemLocation,
  type LedgerActor
} from '../inventory/inventory-ledger-utils';
import { isFinalJobStatus, type RegisterEntryKind } from './company-data.types';
import { insertJobTimelineEntry } from './jobs-data-repository-utils';

export type AutoCostStructuredPartInput = {
  registerEntryId: string;
  jobId: string;
  kind: RegisterEntryKind;
  itemId?: string;
  locationId?: string;
  quantity: number;
  description: string;
  actor: LedgerActor;
  occurredAt: string;
};

/**
 * Attempt to auto-cost a freshly-created register line that named a STRUCTURED truck item +
 * stock location: when it is a `part` line, the job is still open, and the location holds
 * enough on hand, issue the stock to the job (tracked inventory at weighted-average cost), flip
 * the line to `applied`, and record a timeline note. Otherwise leave the line untouched in its
 * classified state (`needsResolution` for a part) for the office to resolve.
 *
 * Returns true iff the line was auto-costed. Must run INSIDE the create transaction, AFTER the
 * register row is inserted (the issue movement links back to it via source_register_entry_id)
 * and after the `registerEntryAdded` timeline entry. It never throws on an ineligible line, a
 * finalized job, or short stock — those are the explicit fall-back cases — so an offline replay
 * onto a closed job (or a truck that has since run dry) still records the line for resolution
 * instead of failing the sync. See docs/job-costing-from-field-capture-spec.md §3.
 */
export async function autoCostStructuredPartLine(
  queryable: QueryExecutor,
  input: AutoCostStructuredPartInput
): Promise<boolean> {
  const itemId = input.itemId?.trim();
  const locationId = input.locationId?.trim();
  if (input.kind !== 'part' || !itemId || !locationId) {
    return false;
  }

  // Serialize against a concurrent completion freeze (the same `for update` lock the freeze
  // takes on the jobs row) and skip — rather than throw — when the job is already final.
  const jobResult = await queryable.query<{ status: JobStatus }>(
    `select status from jobs where id = $1 for update`,
    [input.jobId]
  );
  const status = jobResult.rows[0]?.status ?? null;
  if (status === null || isFinalJobStatus(status)) {
    return false;
  }

  // Read on hand under the (item, location) lock so the issue below cannot over-draw or race a
  // concurrent issue. Short stock falls back to office resolution rather than erroring.
  await lockItemLocation(queryable, itemId, locationId);
  const snapshot = await getOnHandSnapshot(queryable, itemId, locationId);
  if (snapshot.quantity < input.quantity) {
    return false;
  }

  await applyIssueToJob(queryable, {
    itemId,
    locationId,
    jobId: input.jobId,
    quantity: input.quantity,
    actor: input.actor,
    note: `Auto-issued from truck stock: ${input.description}`,
    occurredAt: input.occurredAt,
    sourceRegisterEntryId: input.registerEntryId
  });

  await queryable.query(
    `update register_entries
     set costing_status = 'applied', costing_policy = 'trackedInventory', updated_at = $2
     where id = $1`,
    [input.registerEntryId, input.occurredAt]
  );

  await insertJobTimelineEntry(
    {
      id: randomUUID(),
      jobId: input.jobId,
      occurredAt: input.occurredAt,
      actorName: input.actor.displayName,
      kind: 'registerCostResolved',
      message: `Register cost auto-applied from truck stock: ${input.description}.`
    },
    queryable
  );
  return true;
}
