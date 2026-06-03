-- Migration: 20260601_022_job_cost_snapshots
-- Finalized job-cost snapshot (Milestone 9, B6). When a job is marked completed, the
-- job-cost rollup (inventory receiveToJob/issueToJob + labor/expense events) is frozen into
-- a row here so the finalized number is stable even if cost inputs change afterward — it is
-- never silently recomputed. Reopening the job (final -> active) supersedes the current
-- snapshot; completing again freezes a fresh one. The live rollup is always available from
-- the underlying ledgers; this table only preserves the at-completion figure.

create table if not exists job_cost_snapshots (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  -- Frozen cost components in dollars, at 4 decimals to match inventory value precision.
  material_cost numeric(14, 4) not null,
  labor_cost numeric(14, 4) not null,
  expense_cost numeric(14, 4) not null,
  total_cost numeric(14, 4) not null,
  created_by_name text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null,
  -- Null = this is the current finalized snapshot; set when a reopen supersedes it.
  superseded_at timestamptz
);

create index if not exists job_cost_snapshots_job_idx on job_cost_snapshots (job_id);

-- At most one current (non-superseded) snapshot per job.
create unique index if not exists job_cost_snapshots_one_current_per_job
  on job_cost_snapshots (job_id)
  where superseded_at is null;
