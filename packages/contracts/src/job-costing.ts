import type { JobStatus } from './jobs.js';

// --- Job cost events (Milestone 9) ----------------------------------------------

/**
 * Non-inventory job costs. Stock material/equipment costs flow through inventory movements;
 * `material` here is non-stock / supply-house material entered at the office (it counts toward
 * the rollup's materialCost, not expenseCost) so it is never buried as a generic expense.
 */
export type JobCostEventKind = 'labor' | 'expense' | 'material';

/** An immutable non-inventory cost charged to a job (labor, expense, or non-stock material). */
export interface JobCostEvent {
  id: string;
  jobId: string;
  kind: JobCostEventKind;
  description: string;
  /** Total cost in dollars. Positive for a cost; a reversal carries the negation. */
  amount: number;
  /** Labor provenance: hours billed at ratePerHour equals amount. Absent for expense/material. */
  hours?: number;
  ratePerHour?: number;
  /** Set on a reversal event: the id of the original event it negates. */
  reversalOfEventId?: string;
  /** The register/work line this cost came from, when it was created by resolving one. */
  sourceRegisterEntryId?: string;
  actorName: string;
  occurredAt: string;
}

/** Post a labor cost to a job. The API computes amount = hours * ratePerHour. */
export interface CreateJobLaborRequest {
  description: string;
  hours: number;
  ratePerHour: number;
}

/** Post an expense cost to a job. */
export interface CreateJobExpenseRequest {
  description: string;
  amount: number;
}

/** Reverse (correct) a job cost event by posting its negation. Each event reverses once. */
export interface ReverseJobCostEventRequest {
  reason?: string;
}

export interface JobCostEventResponse {
  event: JobCostEvent;
}

/**
 * A job's cost broken into its three sources (dollars). Material is from inventory movements.
 *
 * `totalCost` is the KNOWN/trusted total: register lines still awaiting cost resolution
 * contribute no dollars and are surfaced via `unresolvedLineCount` rather than an invented
 * figure (see docs/job-costing-from-field-capture-spec.md §2). `costComplete` is false while
 * any contributing line is in `needsResolution`; consumers must not present a final cost or a
 * confident margin while it is false.
 */
export interface JobCostRollup {
  materialCost: number;
  laborCost: number;
  expenseCost: number;
  totalCost: number;
  /** Count of register lines that owe a cost figure but are not yet resolved. */
  unresolvedLineCount: number;
  /** True when no contributing line is in `needsResolution` (i.e. the total is final). */
  costComplete: boolean;
}

/** The cost frozen when a job was completed. `supersededAt` is set once a reopen retires it. */
export interface JobCostSnapshot {
  id: string;
  materialCost: number;
  laborCost: number;
  expenseCost: number;
  totalCost: number;
  createdByName: string;
  occurredAt: string;
  supersededAt?: string;
}

/**
 * Job costing read model: the always-current `live` rollup, plus the `finalized` snapshot
 * frozen at completion (absent until the job is completed, or after a reopen until it is
 * completed again). `isFinalized` is true when a current finalized snapshot exists.
 *
 * `events` are the labor/expense/material ledger entries behind the rollup (newest first, including
 * reversals). Material/equipment detail lives in inventory movements
 * (`GET /operations/inventory/movements?jobId=`), not here.
 */
export interface JobCostingSummary {
  jobId: string;
  jobNumber: string;
  summary: string;
  status: JobStatus;
  live: JobCostRollup;
  finalized?: JobCostSnapshot;
  isFinalized: boolean;
  events: JobCostEvent[];
}

export interface JobCostingResponse {
  costing: JobCostingSummary;
}
