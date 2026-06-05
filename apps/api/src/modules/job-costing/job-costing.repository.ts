import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  JobCostEvent,
  JobCostEventKind,
  JobCostingSummary,
  JobStatus
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { lockJobForCostWrite } from '../company-data/job-cost-write-guard';
import {
  computeJobCostRollup,
  getCurrentJobCostSnapshot,
  roundMoney
} from './job-cost-rollup-utils';

type Actor = { id: string; displayName: string };

type EventRow = {
  id: string;
  jobId: string;
  kind: JobCostEventKind;
  description: string;
  amount: string | number;
  hours: string | number | null;
  ratePerHour: string | number | null;
  reversalOfEventId: string | null;
  sourceRegisterEntryId: string | null;
  actorName: string;
  occurredAt: string | Date;
};

const EVENT_COLUMNS = `
  id, job_id as "jobId", kind, description, amount,
  hours, rate_per_hour as "ratePerHour",
  reversal_of_event_id as "reversalOfEventId",
  source_register_entry_id as "sourceRegisterEntryId",
  actor_name as "actorName", occurred_at as "occurredAt"
`;

@Injectable()
export class JobCostingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** The job's status, or null if the job does not exist (the jobs table is read-only here). */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const result = await this.databaseService.query<{ status: JobStatus }>(
      `select status from jobs where id = $1 limit 1`,
      [jobId]
    );
    return result.rows[0]?.status ?? null;
  }

  /**
   * The job costing read model: the always-current live rollup plus the finalized snapshot
   * (if any). Returns null when the job does not exist.
   */
  async getJobCosting(jobId: string): Promise<JobCostingSummary | null> {
    const jobResult = await this.databaseService.query<{
      jobNumber: string;
      summary: string;
      status: JobStatus;
    }>(`select job_number as "jobNumber", summary, status from jobs where id = $1 limit 1`, [
      jobId
    ]);
    const job = jobResult.rows[0];
    if (!job) {
      return null;
    }

    const rollup = await computeJobCostRollup(this.databaseService, jobId);
    const finalized = await getCurrentJobCostSnapshot(this.databaseService, jobId);
    const events = await this.listEventsForJob(jobId);

    return {
      jobId,
      jobNumber: job.jobNumber,
      summary: job.summary,
      status: job.status,
      live: {
        materialCost: roundMoney(rollup.materialCost),
        laborCost: roundMoney(rollup.laborCost),
        expenseCost: roundMoney(rollup.expenseCost),
        totalCost: roundMoney(rollup.totalCost),
        unresolvedLineCount: rollup.unresolvedLineCount,
        costComplete: rollup.costComplete
      },
      finalized: finalized ?? undefined,
      isFinalized: finalized !== null,
      events
    };
  }

  /** The job's cost events (newest first), including reversals. */
  async listEventsForJob(jobId: string): Promise<JobCostEvent[]> {
    const result = await this.databaseService.query<EventRow>(
      `select ${EVENT_COLUMNS} from job_cost_events
       where job_id = $1
       order by occurred_at desc, created_at desc`,
      [jobId]
    );
    return result.rows.map(toEvent);
  }

  /** Whether the given event has already been reversed (a reversal points at it). */
  async isEventReversed(eventId: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `select 1 from job_cost_events where reversal_of_event_id = $1 limit 1`,
      [eventId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Append a reversal of an existing event: the negation of its amount, carrying the same
   * kind and (for labor) hours/rate provenance, linked via reversal_of_event_id.
   */
  async insertReversal(input: {
    jobId: string;
    kind: JobCostEventKind;
    description: string;
    amount: number;
    hours: number | null;
    ratePerHour: number | null;
    reversalOfEventId: string;
    sourceRegisterEntryId?: string | null;
    actor: Actor;
  }): Promise<JobCostEvent> {
    return this.insert(input);
  }

  /** Append an immutable labor cost event (hours * rate = amount). */
  async insertLabor(input: {
    jobId: string;
    description: string;
    hours: number;
    ratePerHour: number;
    amount: number;
    actor: Actor;
    sourceRegisterEntryId?: string | null;
  }): Promise<JobCostEvent> {
    return this.insert({
      jobId: input.jobId,
      kind: 'labor',
      description: input.description,
      amount: input.amount,
      hours: input.hours,
      ratePerHour: input.ratePerHour,
      actor: input.actor,
      sourceRegisterEntryId: input.sourceRegisterEntryId ?? null
    });
  }

  /** Append an immutable expense cost event. */
  async insertExpense(input: {
    jobId: string;
    description: string;
    amount: number;
    actor: Actor;
  }): Promise<JobCostEvent> {
    return this.insert({
      jobId: input.jobId,
      kind: 'expense',
      description: input.description,
      amount: input.amount,
      hours: null,
      ratePerHour: null,
      actor: input.actor
    });
  }

  /**
   * Append an immutable non-stock material cost event (supply-house part entered at the
   * office). Counts toward the rollup's materialCost, not expenseCost.
   */
  async insertMaterial(input: {
    jobId: string;
    description: string;
    amount: number;
    actor: Actor;
    sourceRegisterEntryId?: string | null;
  }): Promise<JobCostEvent> {
    return this.insert({
      jobId: input.jobId,
      kind: 'material',
      description: input.description,
      amount: input.amount,
      hours: null,
      ratePerHour: null,
      actor: input.actor,
      sourceRegisterEntryId: input.sourceRegisterEntryId ?? null
    });
  }

  private async insert(input: {
    jobId: string;
    kind: JobCostEventKind;
    description: string;
    amount: number;
    hours: number | null;
    ratePerHour: number | null;
    reversalOfEventId?: string | null;
    sourceRegisterEntryId?: string | null;
    actor: Actor;
  }): Promise<JobCostEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    // Lock the job row and reject final jobs in the same transaction as the insert, so a
    // concurrent completion can't freeze the snapshot and then have this cost land after it.
    await this.databaseService.transaction(async (queryable) => {
      await lockJobForCostWrite(queryable, input.jobId);
      await queryable.query(
        `insert into job_cost_events (
           id, job_id, kind, description, amount, hours, rate_per_hour, reversal_of_event_id,
           source_register_entry_id, actor_employee_id, actor_name, occurred_at, created_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
        [
          id,
          input.jobId,
          input.kind,
          input.description,
          input.amount,
          input.hours,
          input.ratePerHour,
          input.reversalOfEventId ?? null,
          input.sourceRegisterEntryId ?? null,
          input.actor.id,
          input.actor.displayName,
          now
        ]
      );
    });
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<JobCostEvent | null> {
    const result = await this.databaseService.query<EventRow>(
      `select ${EVENT_COLUMNS} from job_cost_events where id = $1 limit 1`,
      [id]
    );
    return result.rows[0] ? toEvent(result.rows[0]) : null;
  }
}

function toEvent(row: EventRow): JobCostEvent {
  return {
    id: row.id,
    jobId: row.jobId,
    kind: row.kind,
    description: row.description,
    amount: roundMoney(Number(row.amount)),
    hours: row.hours === null ? undefined : Number(row.hours),
    ratePerHour: row.ratePerHour === null ? undefined : roundMoney(Number(row.ratePerHour)),
    reversalOfEventId: row.reversalOfEventId ?? undefined,
    sourceRegisterEntryId: row.sourceRegisterEntryId ?? undefined,
    actorName: row.actorName,
    occurredAt: toIsoString(row.occurredAt)
  };
}
