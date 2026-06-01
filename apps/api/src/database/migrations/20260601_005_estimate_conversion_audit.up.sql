-- Migration: 20260601_005_estimate_conversion_audit
-- Record when an approved estimate was converted into a job's invoice draft.
--
-- Conversion is an explicit office action (never automatic on approval). It
-- copies the estimate's frozen snapshot into the invoice draft; it must NOT
-- change the estimate's money or status. These are non-financial audit columns
-- only: which invoice the estimate was converted into, when, and by whom. They
-- also let the UI show "already converted" without re-deriving it.

alter table estimates
  add column if not exists converted_to_invoice_id text references invoices(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by_employee_id text references employees(id),
  add column if not exists converted_by_name text;
