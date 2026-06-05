-- Down: 20260601_027_job_cost_event_material_kind
-- Revert to labor/expense only. Assumes no 'material' rows exist (local-dev reversibility);
-- a production rollback would first relabel or remove material events.

alter table job_cost_events drop constraint if exists job_cost_events_provenance_by_kind;
alter table job_cost_events
  add constraint job_cost_events_provenance_by_kind check (
    (kind = 'labor' and hours is not null and rate_per_hour is not null)
    or (kind = 'expense' and hours is null and rate_per_hour is null)
  );

alter table job_cost_events drop constraint if exists job_cost_events_kind_check;
alter table job_cost_events
  add constraint job_cost_events_kind_check check (kind in ('labor', 'expense'));
