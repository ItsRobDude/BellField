import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobCostEvent, JobCostEventKind } from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';

type Actor = { id: string; displayName: string };

type EventRow = {
  id: string;
  jobId: string;
  kind: JobCostEventKind;
  description: string;
  amount: string | number;
  hours: string | number | null;
  ratePerHour: string | number | null;
  actorName: string;
  occurredAt: string | Date;
};

const EVENT_COLUMNS = `
  id, job_id as "jobId", kind, description, amount,
  hours, rate_per_hour as "ratePerHour",
  actor_name as "actorName", occurred_at as "occurredAt"
`;

@Injectable()
export class JobCostingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Whether a job exists (validation; the jobs table is read-only here). */
  async jobExists(jobId: string): Promise<boolean> {
    const result = await this.databaseService.query(`select 1 from jobs where id = $1 limit 1`, [
      jobId
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  /** Append an immutable labor cost event (hours * rate = amount). */
  async insertLabor(input: {
    jobId: string;
    description: string;
    hours: number;
    ratePerHour: number;
    amount: number;
    actor: Actor;
  }): Promise<JobCostEvent> {
    return this.insert({
      jobId: input.jobId,
      kind: 'labor',
      description: input.description,
      amount: input.amount,
      hours: input.hours,
      ratePerHour: input.ratePerHour,
      actor: input.actor
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

  private async insert(input: {
    jobId: string;
    kind: JobCostEventKind;
    description: string;
    amount: number;
    hours: number | null;
    ratePerHour: number | null;
    actor: Actor;
  }): Promise<JobCostEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.query(
      `insert into job_cost_events (
         id, job_id, kind, description, amount, hours, rate_per_hour,
         actor_employee_id, actor_name, occurred_at, created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [
        id,
        input.jobId,
        input.kind,
        input.description,
        input.amount,
        input.hours,
        input.ratePerHour,
        input.actor.id,
        input.actor.displayName,
        now
      ]
    );
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
    actorName: row.actorName,
    occurredAt: toIsoString(row.occurredAt)
  };
}
