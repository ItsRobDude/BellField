-- Migration: 20260601_008_invoice_adjustments
-- Add adjustment/credit invoice kinds as the correction path for a posted invoice
-- (Milestone 8). This supersedes the scope note in 20260601_002 that said adjustment/
-- credit kinds would arrive post-M8.
--
-- An adjustment ('adjustment' = extra charge) or credit ('credit' = reduction) is a
-- separate invoices row for the same job, linked to the posted main it corrects via
-- adjusts_invoice_id. Both store POSITIVE amounts; direction is conveyed by the kind,
-- so the existing >= 0 money checks and the pricing engine stay unchanged. Job balance
-- (main + adjustments - credits) is a later read-side concern.
--
-- The unique-main-per-job index is partial (where invoice_kind = 'main'), so multiple
-- non-main invoices per job are already allowed. Posting/lock + the posted snapshot
-- columns (20260601_007) apply to every invoice row, so a posted adjustment freezes its
-- context just like the main.

-- Widen the kind domain. The inline column check from 20260601_002 is auto-named
-- invoices_invoice_kind_check; replace it with a named table constraint so this stays
-- explicit. Widening validates against every existing ('main') row, so no backfill.
alter table invoices drop constraint if exists invoices_invoice_kind_check;
alter table invoices
  add constraint invoices_invoice_kind_check
  check (invoice_kind in ('main', 'adjustment', 'credit'));

alter table invoices
  add column if not exists adjusts_invoice_id text references invoices(id) on delete set null;

-- A main invoice never points at a parent; an adjustment/credit may (the service always
-- sets it to the job's posted main). Left nullable so `on delete set null` cannot later
-- violate the shape if a parent is ever removed.
alter table invoices
  add constraint invoices_adjusts_shape check (
    (invoice_kind = 'main' and adjusts_invoice_id is null)
    or invoice_kind in ('adjustment', 'credit')
  );
