-- Migration: 20260601_020_job_cost_events (rollback)
drop index if exists job_cost_events_job_idx;
drop table if exists job_cost_events;
