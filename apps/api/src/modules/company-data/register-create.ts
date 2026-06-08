import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobStatus } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import {
  isFinalJobStatus,
  REOPEN_FOR_COST_WRITE_MESSAGE,
  type CostingPolicy,
  type CostingStatus,
  type CreateRegisterEntryInput
} from './company-data.types';
import { insertJobTimelineEntry } from './jobs-data-repository-utils';
import { reflectRegisterEntryCreate } from './invoice-reflection-utils';
import { isCostExpectedRegisterKind } from './register-costing-classification';
import { autoCostStructuredPartLine, isSelfTruckPartRef } from './register-auto-cost';

async function resolvePersistedCatalogItemId(
  queryable: QueryExecutor,
  catalogItemId: string | undefined
): Promise<string | null> {
  const trimmedId = catalogItemId?.trim();
  if (!trimmedId) {
    return null;
  }

  const result = await queryable.query<{ id: string }>(
    `select id from catalog_items where id = $1 limit 1`,
    [trimmedId]
  );
  return result.rows[0]?.id ?? null;
}

export type RegisterEntryInsertArgs = {
  jobId: string;
  input: CreateRegisterEntryInput;
  actor: { id: string; displayName: string };
  timelineTime: string;
  registerEntryId: string;
  costing: { costingStatus: CostingStatus; costingPolicy: CostingPolicy | null };
  clientOperationId: string | null;
  allowFinalizedReplay: boolean;
  /** Called instead of inserting when a prior line already exists for this client operation. */
  markDeduped: (existingId: string) => void;
};

/**
 * Insert a register line and its capture-time side effects (timeline, auto-cost issue-to-job,
 * invoice-draft reflection) inside the caller's transaction. Idempotent on `client_operation_id`:
 * a re-drained field create whose key already produced a line for this job marks the existing id
 * and returns without writing. Locks the job row and re-checks finality so a cost-expected line
 * cannot land after the finalized cost snapshot froze (only a preserved replay may). Server-
 * validates structured truck refs before persisting/auto-costing them.
 */
export async function insertRegisterEntryWithin(
  queryable: QueryExecutor,
  args: RegisterEntryInsertArgs
): Promise<void> {
  const {
    jobId,
    input,
    actor,
    timelineTime,
    registerEntryId,
    costing,
    clientOperationId,
    allowFinalizedReplay,
    markDeduped
  } = args;

  // Idempotent replay: a field-queued create can re-drain after a committed-but-lost response. If
  // this client operation already produced a line, return it untouched — re-inserting would
  // double-bill and (for a structured part) double-issue truck stock. The partial unique index on
  // client_operation_id is the integrity backstop for a concurrent race past this check. Scope the
  // replay to the same job AND the same capturing technician (matching the service pre-check and the
  // 23505 fallback): a key naming a different job or tech is a client bug or probe, not a replay,
  // even if it commits between the service pre-check and this query.
  if (clientOperationId !== null) {
    const replay = await queryable.query<{
      id: string;
      jobId: string;
      capturedByEmployeeId: string;
    }>(
      `select id, job_id as "jobId", captured_by_employee_id as "capturedByEmployeeId"
       from register_entries where client_operation_id = $1 limit 1`,
      [clientOperationId]
    );
    const existing = replay.rows[0];
    if (existing) {
      if (existing.jobId !== jobId || existing.capturedByEmployeeId !== actor.id) {
        throw new ConflictException('This operation id belongs to a different job or technician.');
      }
      markDeduped(existing.id);
      return;
    }
  }

  // Lock the job row and re-check finality INSIDE the transaction. The service pre-checks status
  // too, but that read races a concurrent completion: without this lock a cost-expected line could
  // land after the finalized cost snapshot froze. Only a preserved field replay may insert onto a
  // finalized job (it is recorded for post-reopen resolution).
  const jobStatusResult = await queryable.query<{ status: JobStatus }>(
    `select status from jobs where id = $1 for update`,
    [jobId]
  );
  const jobStatus = jobStatusResult.rows[0]?.status ?? null;
  if (jobStatus === null) {
    throw new NotFoundException('Job not found.');
  }
  if (
    isFinalJobStatus(jobStatus) &&
    isCostExpectedRegisterKind(input.kind) &&
    !allowFinalizedReplay
  ) {
    throw new ConflictException(REOPEN_FOR_COST_WRITE_MESSAGE);
  }

  // Re-validate any client-supplied structured truck refs server-side. Persist them only when they
  // name an active part on the caller's own active truck; otherwise null them so the line is plain
  // free-text (this also avoids a hard FK failure on a stale offline item/location).
  const itemId = input.inventoryItemId?.trim() || null;
  const locationId = input.inventoryLocationId?.trim() || null;
  const structuredRefValid =
    input.kind === 'part' &&
    itemId !== null &&
    locationId !== null &&
    (await isSelfTruckPartRef(queryable, { itemId, locationId, actorId: actor.id }));
  const inventoryItemId = structuredRefValid ? itemId : null;
  const inventoryLocationId = structuredRefValid ? locationId : null;
  const catalogItemId = await resolvePersistedCatalogItemId(queryable, input.catalogItemId);
  const catalogSnapshot = input.catalogSnapshot ?? null;

  await queryable.query(
    `
      insert into register_entries (
        id, job_id, appointment_id, kind, description, quantity, unit_of_measure, unit_price,
        total_amount, part_number, inventory_source_label, billing_projection_state, costing_status,
        costing_policy, captured_by_employee_id, captured_by_name, captured_at, is_void, void_reason,
        created_at, updated_at, inventory_item_id, inventory_location_id, client_operation_id,
        catalog_item_id, catalog_snapshot
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, null, $18, $19, $20, $21, $22, $23, $24)
    `,
    [
      registerEntryId,
      jobId,
      input.appointmentId ?? null,
      input.kind,
      input.description.trim(),
      input.quantity,
      input.unitOfMeasure?.trim() || null,
      input.unitPrice ?? null,
      input.totalAmount,
      input.partNumber?.trim() || null,
      input.inventorySourceLabel?.trim() || null,
      input.billingProjectionState ?? 'billable',
      costing.costingStatus,
      costing.costingPolicy,
      actor.id,
      actor.displayName,
      timelineTime,
      timelineTime,
      timelineTime,
      inventoryItemId,
      inventoryLocationId,
      clientOperationId,
      catalogItemId,
      catalogSnapshot === null ? null : JSON.stringify(catalogSnapshot)
    ]
  );

  await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
  await insertJobTimelineEntry(
    {
      id: randomUUID(),
      jobId,
      occurredAt: timelineTime,
      actorName: actor.displayName,
      kind: 'registerEntryAdded',
      message: `Register entry added: ${input.description.trim()}.`
    },
    queryable
  );

  // Auto-cost a structured truck part at capture time (issue-to-job) when stock allows; otherwise
  // the line stays in needsResolution for the office. Uses the server-validated refs (null unless
  // they passed isSelfTruckPartRef above), so it never issues from an unverified location.
  await autoCostStructuredPartLine(queryable, {
    registerEntryId,
    jobId,
    kind: input.kind,
    itemId: inventoryItemId ?? undefined,
    locationId: inventoryLocationId ?? undefined,
    quantity: input.quantity,
    description: input.description.trim(),
    actor,
    occurredAt: timelineTime
  });

  // Reflect into the job's invoice draft in the same transaction. (If the invoice is already
  // posted, the entry above still persists; reflection is skipped and a "not reflected" note is
  // recorded instead.)
  await reflectRegisterEntryCreate(
    jobId,
    {
      id: registerEntryId,
      kind: input.kind,
      description: input.description.trim(),
      totalAmount: input.totalAmount,
      unitOfMeasure: input.unitOfMeasure?.trim() || undefined,
      partNumber: input.partNumber?.trim() || undefined,
      inventorySourceLabel: input.inventorySourceLabel?.trim() || undefined,
      billingProjectionState: input.billingProjectionState ?? 'billable'
    },
    actor.displayName,
    timelineTime,
    queryable
  );
}
