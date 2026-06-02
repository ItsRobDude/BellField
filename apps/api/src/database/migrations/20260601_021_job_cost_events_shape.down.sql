-- Migration: 20260601_021_job_cost_events_shape (rollback)
alter table job_cost_events drop constraint if exists job_cost_events_amount_sign;
alter table job_cost_events drop constraint if exists job_cost_events_provenance_by_kind;
alter table job_cost_events add constraint job_cost_events_amount_check check (amount <> 0);
