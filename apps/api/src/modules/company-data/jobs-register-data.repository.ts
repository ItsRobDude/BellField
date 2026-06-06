import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobStatus, ResolveRegisterCostRequest } from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { lockJobForCostWrite } from './job-cost-write-guard';
import { applyRegisterCostResolution } from './register-cost-resolution';
import { reverseRegisterCostArtifacts } from './register-cost-reversal';
import {
  isFinalJobStatus,
  REOPEN_FOR_COST_WRITE_MESSAGE,
  type BillingProjectionState,
  type CostingPolicy,
  type CostingStatus,
  type CreateRegisterEntryInput,
  type RegisterEntryKind,
  type RegisterEntryRecord,
  type UpdateRegisterEntryInput
} from './company-data.types';
import {
  buildRegisterEntryVoidedMessage,
  insertJobTimelineEntry
} from './jobs-data-repository-utils';
import {
  reflectRegisterEntryCreate,
  reflectRegisterEntryUpdate,
  reflectRegisterEntryVoid
} from './invoice-reflection-utils';
import {
  classifyRegisterCosting,
  isCostExpectedRegisterKind
} from './register-costing-classification';
import { autoCostStructuredPartLine, isSelfTruckPartRef } from './register-auto-cost';

type RegisterEntryRow = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  kind: RegisterEntryKind;
  description: string;
  quantity: string | number;
  unitOfMeasure: string | null;
  unitPrice: string | number | null;
  totalAmount: string | number;
  partNumber: string | null;
  inventorySourceLabel: string | null;
  inventoryItemId: string | null;
  inventoryLocationId: string | null;
  billingProjectionState: BillingProjectionState;
  costingPolicy: CostingPolicy | null;
  costingStatus: CostingStatus;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string | Date;
  isVoid: boolean;
  voidReason: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

@Injectable()
export class JobsRegisterDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listRegisterEntriesForJob(
    jobId: string,
    includeVoided = false
  ): Promise<RegisterEntryRecord[]> {
    const result = await this.databaseService.query<RegisterEntryRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          description,
          quantity,
          unit_of_measure as "unitOfMeasure",
          unit_price as "unitPrice",
          total_amount as "totalAmount",
          part_number as "partNumber",
          inventory_source_label as "inventorySourceLabel",
          inventory_item_id as "inventoryItemId",
          inventory_location_id as "inventoryLocationId",
          billing_projection_state as "billingProjectionState",
          costing_policy as "costingPolicy",
          costing_status as "costingStatus",
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from register_entries
        where job_id = $1
          and ($2::boolean = true or is_void = false)
        order by captured_at asc, created_at asc, id asc
      `,
      [jobId, includeVoided]
    );

    return result.rows.map((row) => this.toRegisterEntryRecord(row));
  }

  async getRegisterEntryById(registerEntryId: string): Promise<RegisterEntryRecord | null> {
    const result = await this.databaseService.query<RegisterEntryRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          description,
          quantity,
          unit_of_measure as "unitOfMeasure",
          unit_price as "unitPrice",
          total_amount as "totalAmount",
          part_number as "partNumber",
          inventory_source_label as "inventorySourceLabel",
          inventory_item_id as "inventoryItemId",
          inventory_location_id as "inventoryLocationId",
          billing_projection_state as "billingProjectionState",
          costing_policy as "costingPolicy",
          costing_status as "costingStatus",
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from register_entries
        where id = $1
        limit 1
      `,
      [registerEntryId]
    );

    return result.rows[0] ? this.toRegisterEntryRecord(result.rows[0]) : null;
  }

  /** The line a prior field-queued create produced for this idempotency key, if any. */
  async findRegisterEntryByClientOperationId(
    clientOperationId: string
  ): Promise<RegisterEntryRecord | null> {
    const result = await this.databaseService.query<{ id: string }>(
      `select id from register_entries where client_operation_id = $1 limit 1`,
      [clientOperationId]
    );
    return result.rows[0] ? this.getRegisterEntryById(result.rows[0].id) : null;
  }

  async createRegisterEntry(
    jobId: string,
    input: CreateRegisterEntryInput,
    actor: { id: string; displayName: string },
    occurredAt?: string,
    allowFinalizedReplay = false
  ): Promise<RegisterEntryRecord> {
    const timelineTime = occurredAt || new Date().toISOString();
    const registerEntryId = randomUUID();
    const costing = classifyRegisterCosting(input.kind);
    const clientOperationId = input.clientOperationId?.trim() || null;
    // When a replay short-circuits, this holds the already-created line's id to load and return.
    let dedupedExistingId: string | null = null;

    await this.databaseService.transaction(async (queryable) => {
      // Idempotent replay: a field-queued create can re-drain after a committed-but-lost response.
      // If this client operation already produced a line, return it untouched — re-inserting would
      // double-bill and (for a structured part) double-issue truck stock. The partial unique index
      // on client_operation_id is the integrity backstop for a concurrent race past this check.
      if (clientOperationId !== null) {
        const replay = await queryable.query<{ id: string }>(
          `select id from register_entries where client_operation_id = $1 and job_id = $2 limit 1`,
          [clientOperationId, jobId]
        );
        if (replay.rows[0]) {
          dedupedExistingId = replay.rows[0].id;
          return;
        }
      }

      // Lock the job row and re-check finality INSIDE the transaction. The service pre-checks
      // status too, but that read races a concurrent completion: without this lock a cost-
      // expected line could land after the finalized cost snapshot froze. Only a preserved field
      // replay may insert onto a finalized job (it is recorded for post-reopen resolution).
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

      // Re-validate any client-supplied structured truck refs server-side. Persist them only when
      // they name an active part on the caller's own active truck; otherwise null them so the line
      // is plain free-text (this also avoids a hard FK failure on a stale offline item/location).
      const itemId = input.inventoryItemId?.trim() || null;
      const locationId = input.inventoryLocationId?.trim() || null;
      const structuredRefValid =
        input.kind === 'part' &&
        itemId !== null &&
        locationId !== null &&
        (await isSelfTruckPartRef(queryable, { itemId, locationId, actorId: actor.id }));
      const inventoryItemId = structuredRefValid ? itemId : null;
      const inventoryLocationId = structuredRefValid ? locationId : null;

      await queryable.query(
        `
          insert into register_entries (
            id,
            job_id,
            appointment_id,
            kind,
            description,
            quantity,
            unit_of_measure,
            unit_price,
            total_amount,
            part_number,
            inventory_source_label,
            billing_projection_state,
            costing_status,
            costing_policy,
            captured_by_employee_id,
            captured_by_name,
            captured_at,
            is_void,
            void_reason,
            created_at,
            updated_at,
            inventory_item_id,
            inventory_location_id,
            client_operation_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, null, $18, $19, $20, $21, $22)
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
          clientOperationId
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

      // Auto-cost a structured truck part at capture time (issue-to-job) when stock allows;
      // otherwise the line stays in needsResolution for the office. Uses the server-validated
      // refs (null unless they passed isSelfTruckPartRef above), so it never issues from an
      // unverified location. Self-skips when ineligible.
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

      // Reflect into the job's invoice draft in the same transaction. (If the invoice
      // is already posted, the entry above still persists; reflection is skipped and a
      // "not reflected" note is recorded instead.)
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
    });

    // On a deduped replay, load the line the original create produced; otherwise the new one.
    const registerEntry = await this.getRegisterEntryById(dedupedExistingId ?? registerEntryId);

    if (!registerEntry) {
      throw new Error('Created register entry could not be loaded.');
    }

    return registerEntry;
  }

  async updateRegisterEntry(
    registerEntryId: string,
    input: UpdateRegisterEntryInput,
    actorName: string,
    occurredAt?: string,
    allowFinalizedReplay = false
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const nextKind = input.kind ?? existingEntry.kind;
    const nextEntry: RegisterEntryRecord = {
      ...existingEntry,
      appointmentId:
        input.appointmentId !== undefined
          ? input.appointmentId?.trim() || undefined
          : existingEntry.appointmentId,
      kind: nextKind,
      description:
        input.description !== undefined ? input.description.trim() : existingEntry.description,
      quantity: input.quantity ?? existingEntry.quantity,
      unitOfMeasure:
        input.unitOfMeasure !== undefined
          ? input.unitOfMeasure.trim() || undefined
          : existingEntry.unitOfMeasure,
      unitPrice:
        input.unitPrice !== undefined ? (input.unitPrice ?? undefined) : existingEntry.unitPrice,
      totalAmount: input.totalAmount ?? existingEntry.totalAmount,
      partNumber:
        input.partNumber !== undefined
          ? input.partNumber.trim() || undefined
          : existingEntry.partNumber,
      inventorySourceLabel:
        input.inventorySourceLabel !== undefined
          ? input.inventorySourceLabel.trim() || undefined
          : existingEntry.inventorySourceLabel,
      inventoryItemId:
        input.inventoryItemId !== undefined
          ? input.inventoryItemId.trim() || undefined
          : existingEntry.inventoryItemId,
      inventoryLocationId:
        input.inventoryLocationId !== undefined
          ? input.inventoryLocationId.trim() || undefined
          : existingEntry.inventoryLocationId,
      billingProjectionState: input.billingProjectionState ?? existingEntry.billingProjectionState,
      updatedAt: timelineTime
    };

    await this.databaseService.transaction(async (queryable) => {
      // Lock the row and read its CURRENT cost state, so the costing decision below is based on
      // the live value — a concurrent resolver that already moved the line to `applied` (it also
      // locks `for update`) is serialized with this edit and never clobbered back.
      const lockedResult = await queryable.query<{
        costingStatus: CostingStatus;
        costingPolicy: CostingPolicy | null;
        isVoid: boolean;
      }>(
        `select costing_status as "costingStatus", costing_policy as "costingPolicy",
                is_void as "isVoid"
         from register_entries
         where id = $1
         for update`,
        [registerEntryId]
      );
      const locked = lockedResult.rows[0];
      if (!locked) {
        throw new NotFoundException('Register entry not found.');
      }
      if (locked.isVoid) {
        // Editing a voided line could resurrect a billing line for cancelled work.
        throw new ConflictException('Cannot edit a voided register entry.');
      }

      // Lock the job and read finality in-tx (race-safe with a concurrent completion); the
      // non-applied branch below uses it to refuse edits that would create unresolved cost on a
      // finalized job.
      const jobStatusResult = await queryable.query<{ status: JobStatus }>(
        `select status from jobs where id = $1 for update`,
        [existingEntry.jobId]
      );
      const jobStatus = jobStatusResult.rows[0]?.status ?? null;

      let finalCostingStatus: CostingStatus;
      let finalCostingPolicy: CostingPolicy | null;
      if (locked.costingStatus === 'applied' || locked.costingStatus === 'reversed') {
        // A resolved line's cost artifact is already posted against a specific kind/quantity and
        // structured source. Refuse cost-relevant edits (those need an explicit reversal); keep
        // its cost status as-is.
        const kindChanged = input.kind !== undefined && input.kind !== existingEntry.kind;
        const quantityChanged =
          input.quantity !== undefined && input.quantity !== existingEntry.quantity;
        const itemRefChanged =
          input.inventoryItemId !== undefined &&
          (input.inventoryItemId.trim() || undefined) !== existingEntry.inventoryItemId;
        const locationRefChanged =
          input.inventoryLocationId !== undefined &&
          (input.inventoryLocationId.trim() || undefined) !== existingEntry.inventoryLocationId;
        if (kindChanged || quantityChanged || itemRefChanged || locationRefChanged) {
          throw new ConflictException(
            "Reverse the resolved cost before changing this line's kind, quantity, or stock source."
          );
        }
        finalCostingStatus = locked.costingStatus;
        finalCostingPolicy = locked.costingPolicy;
      } else {
        // A non-applied line that is (or becomes) cost-expected on a finalized job would leave
        // unresolved cost after the snapshot already froze — e.g. reclassifying a serviceItem
        // line to `part` turns it into needsResolution that cannot be resolved without reopening.
        // Block it unless this is a preserved field replay (recorded for post-reopen resolution,
        // like the create path).
        if (
          jobStatus !== null &&
          isFinalJobStatus(jobStatus) &&
          isCostExpectedRegisterKind(nextKind) &&
          !allowFinalizedReplay
        ) {
          throw new ConflictException(REOPEN_FOR_COST_WRITE_MESSAGE);
        }
        const reclassified = classifyRegisterCosting(nextKind);
        finalCostingStatus = reclassified.costingStatus;
        finalCostingPolicy = reclassified.costingPolicy;
      }

      await queryable.query(
        `
          update register_entries
          set
            appointment_id = $2,
            kind = $3,
            description = $4,
            quantity = $5,
            unit_of_measure = $6,
            unit_price = $7,
            total_amount = $8,
            part_number = $9,
            inventory_source_label = $10,
            inventory_item_id = $11,
            inventory_location_id = $12,
            billing_projection_state = $13,
            costing_status = $14,
            costing_policy = $15,
            updated_at = $16
          where id = $1
        `,
        [
          registerEntryId,
          nextEntry.appointmentId ?? null,
          nextEntry.kind,
          nextEntry.description,
          nextEntry.quantity,
          nextEntry.unitOfMeasure ?? null,
          nextEntry.unitPrice ?? null,
          nextEntry.totalAmount,
          nextEntry.partNumber ?? null,
          nextEntry.inventorySourceLabel ?? null,
          nextEntry.inventoryItemId ?? null,
          nextEntry.inventoryLocationId ?? null,
          nextEntry.billingProjectionState,
          finalCostingStatus,
          finalCostingPolicy ?? null,
          timelineTime
        ]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [
        existingEntry.jobId,
        timelineTime
      ]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: existingEntry.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'registerEntryEdited',
          message: `Register entry edited: ${nextEntry.description}.`
        },
        queryable
      );

      // Flow the edit into the linked invoice line (office-detached lines are left alone;
      // a posted invoice is left untouched and the edit is noted instead).
      await reflectRegisterEntryUpdate(
        {
          id: registerEntryId,
          jobId: existingEntry.jobId,
          kind: nextEntry.kind,
          description: nextEntry.description,
          totalAmount: nextEntry.totalAmount,
          unitOfMeasure: nextEntry.unitOfMeasure,
          partNumber: nextEntry.partNumber,
          inventorySourceLabel: nextEntry.inventorySourceLabel,
          billingProjectionState: nextEntry.billingProjectionState
        },
        actorName,
        timelineTime,
        queryable
      );
    });

    return this.getRegisterEntryById(registerEntryId);
  }

  async voidRegisterEntry(
    registerEntryId: string,
    reason: string | undefined,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const trimmedReason = reason?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      // Lock + read the current cost state (race-safe with a concurrent resolve, and tells us
      // whether cost was already posted and must now be reversed).
      const lockedResult = await queryable.query<{ costingStatus: CostingStatus; isVoid: boolean }>(
        `select costing_status as "costingStatus", is_void as "isVoid"
         from register_entries
         where id = $1
         for update`,
        [registerEntryId]
      );
      const locked = lockedResult.rows[0];
      if (!locked || locked.isVoid) {
        // Gone or already voided — nothing to do (idempotent void).
        return;
      }

      const reverseCost = locked.costingStatus === 'applied';
      if (reverseCost) {
        // Reversing a posted cost is a cost write — reject on a finalized job (reopen required).
        await lockJobForCostWrite(queryable, existingEntry.jobId);
      }

      await queryable.query(
        `
          update register_entries
          set
            is_void = true,
            void_reason = $2,
            costing_status = $3,
            updated_at = $4
          where id = $1
        `,
        [
          registerEntryId,
          trimmedReason,
          reverseCost ? 'reversed' : locked.costingStatus,
          timelineTime
        ]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [
        existingEntry.jobId,
        timelineTime
      ]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: existingEntry.jobId,
          occurredAt: timelineTime,
          actorName: actor.displayName,
          kind: 'registerEntryVoided',
          message: buildRegisterEntryVoidedMessage(existingEntry.description, trimmedReason)
        },
        queryable
      );

      if (reverseCost) {
        // Reverse the cost artifacts this line produced so the rollup drops their cost.
        await reverseRegisterCostArtifacts(queryable, {
          registerEntryId,
          jobId: existingEntry.jobId,
          actor,
          occurredAt: timelineTime
        });
      }

      // Void the linked invoice line so the bill no longer includes voided work (a posted
      // invoice is left untouched and the void is noted instead).
      await reflectRegisterEntryVoid(
        registerEntryId,
        existingEntry.jobId,
        existingEntry.description,
        actor.displayName,
        timelineTime,
        queryable
      );
    });

    return this.getRegisterEntryById(registerEntryId);
  }

  /**
   * Resolve the cost of a register line that is in `needsResolution`: create the cost artifact
   * the office chose (stock issue / non-stock material / labor / none), link it to the line via
   * source_register_entry_id, and move the line to `applied` — all in one transaction. Rejects
   * a line not awaiting resolution, a finalized job (via the cost-write lock), insufficient
   * stock (via the issue), and a mode that does not match the line's kind. Returns the job id.
   */
  async resolveRegisterEntryCost(
    registerEntryId: string,
    resolution: ResolveRegisterCostRequest,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<{ jobId: string }> {
    const timelineTime = occurredAt || new Date().toISOString();
    let jobId = '';
    await this.databaseService.transaction(async (queryable) => {
      const entryResult = await queryable.query<{
        id: string;
        jobId: string;
        kind: RegisterEntryKind;
        quantity: string | number;
        description: string;
        costingStatus: CostingStatus;
        isVoid: boolean;
      }>(
        `select id, job_id as "jobId", kind, quantity, description,
                costing_status as "costingStatus", is_void as "isVoid"
         from register_entries
         where id = $1
         for update`,
        [registerEntryId]
      );
      const entry = entryResult.rows[0];
      if (!entry) {
        throw new NotFoundException('Register entry not found.');
      }
      if (entry.isVoid) {
        // A voided line is cancelled work; resolving it would post real cost the rollup counts
        // while the unresolved count (which excludes voided rows) shows nothing.
        throw new ConflictException('Cannot resolve the cost of a voided register line.');
      }
      if (entry.costingStatus !== 'needsResolution') {
        throw new ConflictException('This register line is not awaiting cost resolution.');
      }
      jobId = entry.jobId;
      // Reject a finalized job and serialize against a concurrent completion.
      await lockJobForCostWrite(queryable, jobId);

      const policy = await applyRegisterCostResolution(
        queryable,
        {
          id: entry.id,
          jobId,
          kind: entry.kind,
          quantity: Number(entry.quantity),
          description: entry.description
        },
        resolution,
        actor,
        timelineTime
      );

      await queryable.query(
        `update register_entries
         set costing_status = 'applied', costing_policy = $2, updated_at = $3
         where id = $1`,
        [registerEntryId, policy, timelineTime]
      );
      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName: actor.displayName,
          kind: 'registerCostResolved',
          message: `Register cost resolved: ${entry.description} (${policy}).`
        },
        queryable
      );
    });
    return { jobId };
  }

  private toRegisterEntryRecord(row: RegisterEntryRow): RegisterEntryRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      appointmentId: row.appointmentId ?? undefined,
      kind: row.kind,
      description: row.description,
      quantity: Number(row.quantity),
      unitOfMeasure: row.unitOfMeasure ?? undefined,
      unitPrice: row.unitPrice === null ? undefined : Number(row.unitPrice),
      totalAmount: Number(row.totalAmount),
      partNumber: row.partNumber ?? undefined,
      inventorySourceLabel: row.inventorySourceLabel ?? undefined,
      inventoryItemId: row.inventoryItemId ?? undefined,
      inventoryLocationId: row.inventoryLocationId ?? undefined,
      billingProjectionState: row.billingProjectionState,
      costingPolicy: row.costingPolicy ?? undefined,
      costingStatus: row.costingStatus,
      capturedByEmployeeId: row.capturedByEmployeeId,
      capturedByName: row.capturedByName,
      capturedAt: toIsoString(row.capturedAt),
      isVoid: row.isVoid,
      voidReason: row.voidReason ?? undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }
}
