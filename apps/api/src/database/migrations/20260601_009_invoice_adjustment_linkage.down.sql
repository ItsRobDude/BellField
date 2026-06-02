-- Migration: 20260601_009_invoice_adjustment_linkage (rollback)
-- Restore the 008 shape: a nullable parent for all kinds and an `on delete set
-- null` FK.
alter table invoices drop constraint if exists invoices_adjusts_shape;
alter table invoices
  add constraint invoices_adjusts_shape check (
    (invoice_kind = 'main' and adjusts_invoice_id is null)
    or invoice_kind in ('adjustment', 'credit')
  );

alter table invoices drop constraint if exists invoices_adjusts_invoice_id_fkey;
alter table invoices
  add constraint invoices_adjusts_invoice_id_fkey
  foreign key (adjusts_invoice_id) references invoices(id) on delete set null;
