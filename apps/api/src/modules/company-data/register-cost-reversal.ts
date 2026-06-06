import type { JobCostEventKind } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import { applyReturnFromJob } from '../inventory/inventory-ledger-utils';
import { insertJobCostEventWithin } from '../job-costing/job-cost-rollup-utils';

/**
 * Reverse the cost artifacts a register line produced: a `returnFromJob` per un-returned
 * `issueToJob`, and a negating event per un-reversed labor/material cost event — all linked back
 * to the same register line. Runs inside the void transaction (the caller has already locked the
 * job for the cost write). Idempotent: only artifacts without an existing reversal are touched, so
 * a re-run (or a void after a partial failure) does not double-reverse.
 */
export async function reverseRegisterCostArtifacts(
  queryable: QueryExecutor,
  input: {
    registerEntryId: string;
    jobId: string;
    actor: { id: string; displayName: string };
    occurredAt: string;
  }
): Promise<void> {
  const { registerEntryId, jobId, actor, occurredAt } = input;

  const issues = await queryable.query<{ id: string }>(
    `select m.id
     from inventory_movements m
     where m.source_register_entry_id = $1 and m.kind = 'issueToJob'
       and not exists (
         select 1 from inventory_movements r
         where r.kind = 'returnFromJob' and r.reversal_of_movement_id = m.id
       )`,
    [registerEntryId]
  );
  for (const issue of issues.rows) {
    await applyReturnFromJob(queryable, {
      reversalOfMovementId: issue.id,
      actor,
      note: 'Register line voided.',
      occurredAt
    });
  }

  const events = await queryable.query<{
    id: string;
    kind: JobCostEventKind;
    amount: string | number;
    hours: string | number | null;
    ratePerHour: string | number | null;
    description: string;
  }>(
    `select e.id, e.kind, e.amount, e.hours, e.rate_per_hour as "ratePerHour", e.description
     from job_cost_events e
     where e.source_register_entry_id = $1 and e.reversal_of_event_id is null
       and not exists (
         select 1 from job_cost_events r where r.reversal_of_event_id = e.id
       )`,
    [registerEntryId]
  );
  for (const event of events.rows) {
    await insertJobCostEventWithin(queryable, {
      jobId,
      kind: event.kind,
      description: `Reversal of: ${event.description}`,
      amount: -Number(event.amount),
      hours: event.hours === null ? null : Number(event.hours),
      ratePerHour: event.ratePerHour === null ? null : Number(event.ratePerHour),
      reversalOfEventId: event.id,
      sourceRegisterEntryId: registerEntryId,
      actor,
      occurredAt
    });
  }
}
