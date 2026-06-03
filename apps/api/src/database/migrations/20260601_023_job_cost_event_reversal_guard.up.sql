-- Migration: 20260601_023_job_cost_event_reversal_guard
-- Corrections to the job-cost ledger are reversal events (a negation pointing at the
-- original via reversal_of_event_id). Each original event may be reversed at most once: a
-- partial unique index on the pointer makes a double-reversal impossible at the DB level.
-- (Reversing a reversal is blocked in the service: the target must be an original event.)

create unique index if not exists job_cost_events_one_reversal_per_event
  on job_cost_events (reversal_of_event_id)
  where reversal_of_event_id is not null;
