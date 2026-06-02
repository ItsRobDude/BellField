-- Migration: 20260601_021_job_cost_events_shape
-- Tighten the job-cost ledger so the B6 rollup can trust every row, replacing the loose
-- `amount <> 0` check with two structural invariants:
--   1. Provenance follows kind — a labor event carries hours + rate_per_hour; an expense
--      carries neither. (Migration 020 already pins hours > 0 / rate >= 0 when present.)
--   2. Sign follows correction status — an original cost is positive; a reversal (it points
--      at the event it negates via reversal_of_event_id) is negative. So a non-reversal can
--      never be zero/negative and a reversal can never be a positive "cost".

alter table job_cost_events
  drop constraint if exists job_cost_events_amount_check;

alter table job_cost_events
  add constraint job_cost_events_provenance_by_kind check (
    (kind = 'labor' and hours is not null and rate_per_hour is not null)
    or (kind = 'expense' and hours is null and rate_per_hour is null)
  );

alter table job_cost_events
  add constraint job_cost_events_amount_sign check (
    (reversal_of_event_id is null and amount > 0)
    or (reversal_of_event_id is not null and amount < 0)
  );
