-- Migration: 20260601_009_invoice_adjustment_linkage
-- Tighten the adjustment/credit -> parent linkage at the database level.
--
-- Migration 008 added adjusts_invoice_id and a row-shape check, but left the
-- column nullable for EVERY kind so that an `on delete set null` FK could never
-- violate the shape check if a parent were removed. That left a real gap: an
-- adjustment/credit row could be written with adjusts_invoice_id = null and still
-- pass the check. The job balance read model sums posted adjustments/credits by
-- job, so a parentless correction would silently count toward the balance. The
-- service always sets the parent (it creates corrections from the job's posted
-- main), but the database did not enforce it.
--
-- Invoices are never hard-deleted in BellField: the main draft is created eagerly
-- and a posted invoice is a locked accounting record. So `on delete set null` is
-- dead weight. Re-point the FK to `on delete restrict` (a referenced invoice
-- cannot be deleted out from under a correction) and require every
-- adjustment/credit to carry a non-null parent. A main still carries none.

-- Re-point the parent FK so the NOT-NULL invariant below cannot be undermined by
-- a cascade-to-null, and so a parent that has corrections cannot be deleted.
alter table invoices drop constraint if exists invoices_adjusts_invoice_id_fkey;
alter table invoices
  add constraint invoices_adjusts_invoice_id_fkey
  foreign key (adjusts_invoice_id) references invoices(id) on delete restrict;

-- A main never points at a parent; an adjustment/credit must point at exactly one.
alter table invoices drop constraint if exists invoices_adjusts_shape;
alter table invoices
  add constraint invoices_adjusts_shape check (
    case
      when invoice_kind = 'main' then adjusts_invoice_id is null
      else adjusts_invoice_id is not null
    end
  );
