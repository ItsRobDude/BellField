-- Migration: 20260601_020_job_cost_events
-- Non-inventory job-cost ledger (Milestone 9). Labor and expense costs charged to a job
-- are immutable events; corrections are reversal events (a negation pointing at the
-- original via reversal_of_event_id), never edits or deletes — the same discipline as the
-- inventory movement ledger. The B6 job-cost rollup sums amount here plus the
-- issueToJob/receiveToJob inventory movements. Material and equipment costs live in
-- inventory_movements, NOT here, so a cost is counted in exactly one ledger.

create table if not exists job_cost_events (
  id text primary key,
  job_id text not null references jobs(id),
  kind text not null check (kind in ('labor', 'expense')),
  description text not null,
  -- Total cost in dollars. Positive for a cost; a reversal posts the negation.
  amount numeric(12, 2) not null check (amount <> 0),
  -- Labor provenance: hours * rate_per_hour = amount. Both null for an expense.
  hours numeric(12, 2) check (hours is null or hours > 0),
  rate_per_hour numeric(12, 2) check (rate_per_hour is null or rate_per_hour >= 0),
  reversal_of_event_id text references job_cost_events(id),
  actor_employee_id text not null references employees(id),
  actor_name text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null
);

create index if not exists job_cost_events_job_idx on job_cost_events (job_id);
