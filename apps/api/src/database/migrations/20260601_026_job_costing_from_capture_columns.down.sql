-- Down: 20260601_026_job_costing_from_capture_columns
-- Reverse the additive job-costing-from-capture foundation columns.

drop index if exists job_cost_events_source_register_entry_idx;
drop index if exists inventory_movements_source_register_entry_idx;

alter table job_cost_events drop column if exists source_register_entry_id;
alter table inventory_movements drop column if exists source_register_entry_id;

alter table register_entries drop constraint if exists register_entries_costing_status_check;
alter table register_entries drop constraint if exists register_entries_costing_policy_check;
alter table register_entries drop constraint if exists register_entries_billing_projection_state_check;

alter table register_entries
  drop column if exists costing_status,
  drop column if exists costing_policy,
  drop column if exists billing_projection_state;
