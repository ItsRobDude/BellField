-- Migration: 20260601_008_invoice_adjustments (rollback)
-- Narrowing the kind check back to ('main') is best-effort: it fails if any
-- adjustment/credit rows exist. That is the expected behavior when rolling back an
-- enum widen against live data.
alter table invoices drop constraint if exists invoices_adjusts_shape;
alter table invoices drop column if exists adjusts_invoice_id;

alter table invoices drop constraint if exists invoices_invoice_kind_check;
alter table invoices
  add constraint invoices_invoice_kind_check
  check (invoice_kind in ('main'));
