-- Migration: 20260601_027_job_cost_event_material_kind
-- Add a 'material' job-cost-event kind so the office can resolve a non-stock / supply-house
-- part as real MATERIAL cost (counted in materialCost, not buried as a generic expense), and
-- without inventing a catalog item. Like an expense, a material event carries no hours/rate.
-- See docs/job-costing-from-field-capture-spec.md §4, §9 (Slice 1a-D).

alter table job_cost_events drop constraint if exists job_cost_events_kind_check;
alter table job_cost_events
  add constraint job_cost_events_kind_check check (kind in ('labor', 'expense', 'material'));

alter table job_cost_events drop constraint if exists job_cost_events_provenance_by_kind;
alter table job_cost_events
  add constraint job_cost_events_provenance_by_kind check (
    (kind = 'labor' and hours is not null and rate_per_hour is not null)
    or (kind in ('expense', 'material') and hours is null and rate_per_hour is null)
  );
