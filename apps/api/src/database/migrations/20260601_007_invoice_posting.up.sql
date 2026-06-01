-- Migration: 20260601_007_invoice_posting
-- Freeze the customer/location/job display context onto an invoice when it is posted
-- (Milestone 8). The earlier draft migration (20260601_002) deferred this snapshot to
-- posting on purpose: a draft is live and resolves current names, so freezing context
-- only matters once the invoice becomes the locked accounting record.
--
-- DISPLAY CONTEXT ONLY. Money totals and per-line amounts already freeze on write via
-- the pricing layer; posting does NOT recompute or re-snapshot money. These columns
-- preserve who/where the bill was for, as it read at posting, so later CRM edits cannot
-- rewrite an old posted invoice. All columns are nullable: a draft leaves them null and
-- the posting UPDATE fills them in one atomic step.
--
-- Snapshot ids (bill_to_customer_id, service_location_id) are plain text, NOT foreign
-- keys: a frozen historical record must never be nulled by a later customer/location
-- delete. The audit posted_by_employee_id does reference employees(id) (employees are
-- not hard-deleted), matching the estimate approve/convert audit columns.

alter table invoices
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by_employee_id text references employees(id),
  add column if not exists posted_by_name text,
  add column if not exists bill_to_customer_id text,
  add column if not exists bill_to_customer_name text,
  add column if not exists bill_to_account_type text,
  add column if not exists bill_to_address_line1 text,
  add column if not exists bill_to_city text,
  add column if not exists bill_to_state text,
  add column if not exists bill_to_postal_code text,
  add column if not exists service_location_id text,
  add column if not exists service_location_name text,
  add column if not exists service_location_address_line1 text,
  add column if not exists service_location_city text,
  add column if not exists service_location_state text,
  add column if not exists service_location_postal_code text,
  add column if not exists job_number text,
  add column if not exists work_order_number text;

-- Backstop the invariant in the database: a posted invoice must carry the essential
-- frozen context. Addresses / account type / work order are intentionally excluded —
-- they are CRM data-quality details, not invoicing invariants, and a customer recorded
-- without a complete address must still be postable. The `status <> 'posted' or (...)`
-- form lets every existing draft row (null snapshot) pass unchanged, so no backfill is
-- needed and the migration applies cleanly to live data.
alter table invoices
  add constraint invoices_posted_snapshot check (
    status <> 'posted' or (
      posted_at is not null
      and posted_by_employee_id is not null
      and posted_by_name is not null
      and bill_to_customer_id is not null
      and bill_to_customer_name is not null
      and service_location_id is not null
      and service_location_name is not null
      and job_number is not null
    )
  );
