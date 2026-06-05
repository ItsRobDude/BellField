-- Migration: 20260601_026_job_costing_from_capture_columns
-- Foundation for "job costing from field capture" (Slice 1a, additive/schema-only).
-- See docs/job-costing-from-field-capture-spec.md.
--
-- 1. register_entries gains three columns, all defaulting to today's behavior so existing
--    rows and current field/API payloads stay valid with zero behavior change:
--      * billing_projection_state — how the line projects onto the customer invoice
--        (default 'billable' = every register line reflects to the invoice, as today).
--      * costing_policy — the server-inferred cost policy (nullable until classified;
--        classification + status transitions land in a later sub-step).
--      * costing_status — the resolution state (default 'notCosted'; the server overwrites
--        it to needsResolution/applied on write once classification ships).
-- 2. inventory_movements and job_cost_events gain a nullable source_register_entry_id so a
--    cost artifact can link back to the register line that produced it (audit, reversal,
--    and component-level idempotency). invoice_line_items already carries this link.

alter table register_entries
  add column if not exists billing_projection_state text not null default 'billable',
  add column if not exists costing_policy text,
  add column if not exists costing_status text not null default 'notCosted';

alter table register_entries
  add constraint register_entries_billing_projection_state_check
    check (billing_projection_state in ('billable', 'noChargeShown', 'internalOnly', 'notBilled'));

alter table register_entries
  add constraint register_entries_costing_policy_check
    check (
      costing_policy is null or costing_policy in (
        'none', 'trackedInventory', 'nonStockMaterial',
        'laborActual', 'laborStandard', 'expense', 'compositeServiceTask'
      )
    );

alter table register_entries
  add constraint register_entries_costing_status_check
    check (costing_status in ('notCosted', 'applied', 'needsResolution', 'reversed'));

alter table inventory_movements
  add column if not exists source_register_entry_id text
    references register_entries(id) on delete set null;

alter table job_cost_events
  add column if not exists source_register_entry_id text
    references register_entries(id) on delete set null;

create index if not exists inventory_movements_source_register_entry_idx
  on inventory_movements(source_register_entry_id)
  where source_register_entry_id is not null;

create index if not exists job_cost_events_source_register_entry_idx
  on job_cost_events(source_register_entry_id)
  where source_register_entry_id is not null;
