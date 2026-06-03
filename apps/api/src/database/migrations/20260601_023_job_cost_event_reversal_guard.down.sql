-- Migration: 20260601_023_job_cost_event_reversal_guard (rollback)
drop index if exists job_cost_events_one_reversal_per_event;
