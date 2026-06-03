-- Migration: 20260601_022_job_cost_snapshots (rollback)
drop index if exists job_cost_snapshots_one_current_per_job;
drop index if exists job_cost_snapshots_job_idx;
drop table if exists job_cost_snapshots;
