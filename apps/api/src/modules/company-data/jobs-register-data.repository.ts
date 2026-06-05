import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  BillingProjectionState,
  CostingPolicy,
  CostingStatus,
  CreateRegisterEntryInput,
  RegisterEntryKind,
  RegisterEntryRecord,
  UpdateRegisterEntryInput
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
import { classifyRegisterCosting } from './register-costing-classification';

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

  async createRegisterEntry(
    jobId: string,
    input: CreateRegisterEntryInput,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    const timelineTime = occurredAt || new Date().toISOString();
    const registerEntryId = randomUUID();
    const costing = classifyRegisterCosting(input.kind);

    await this.databaseService.transaction(async (queryable) => {
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
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, null, $18, $19)
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
          timelineTime
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

    const registerEntry = await this.getRegisterEntryById(registerEntryId);

    if (!registerEntry) {
      throw new Error('Created register entry could not be loaded.');
    }

    return registerEntry;
  }

  async updateRegisterEntry(
    registerEntryId: string,
    input: UpdateRegisterEntryInput,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const nextKind = input.kind ?? existingEntry.kind;
    // Re-derive the cost classification only while the line is still unresolved/uncosted.
    // Once a line is `applied` (cost posted) or `reversed`, an edit must NOT silently change
    // its cost side — that requires an explicit void/reversal, not a re-classification.
    const costing =
      existingEntry.costingStatus === 'applied' || existingEntry.costingStatus === 'reversed'
        ? { costingStatus: existingEntry.costingStatus, costingPolicy: existingEntry.costingPolicy }
        : classifyRegisterCosting(nextKind);
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
      billingProjectionState: input.billingProjectionState ?? existingEntry.billingProjectionState,
      costingStatus: costing.costingStatus,
      costingPolicy: costing.costingPolicy ?? undefined,
      updatedAt: timelineTime
    };

    await this.databaseService.transaction(async (queryable) => {
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
            billing_projection_state = $11,
            costing_status = $12,
            costing_policy = $13,
            updated_at = $14
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
          nextEntry.billingProjectionState,
          nextEntry.costingStatus,
          nextEntry.costingPolicy ?? null,
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
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const trimmedReason = reason?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update register_entries
          set
            is_void = true,
            void_reason = $2,
            updated_at = $3
          where id = $1
        `,
        [registerEntryId, trimmedReason, timelineTime]
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
          kind: 'registerEntryVoided',
          message: buildRegisterEntryVoidedMessage(existingEntry.description, trimmedReason)
        },
        queryable
      );

      // Void the linked invoice line so the bill no longer includes voided work (a posted
      // invoice is left untouched and the void is noted instead).
      await reflectRegisterEntryVoid(
        registerEntryId,
        existingEntry.jobId,
        existingEntry.description,
        actorName,
        timelineTime,
        queryable
      );
    });

    return this.getRegisterEntryById(registerEntryId);
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
