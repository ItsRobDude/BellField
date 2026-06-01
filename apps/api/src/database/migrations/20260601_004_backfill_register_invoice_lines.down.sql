-- Migration: 20260601_004_backfill_register_invoice_lines (rollback)
-- Remove the invoice lines this backfill created (their ids are deterministic),
-- then reset affected invoice totals back to an empty zero-dollar draft. Lines
-- created by the runtime reflection path use random uuids and are left intact.
delete from invoice_line_items where id like 'invline-reg-%';

update invoices set
  subtotal_amount = 0,
  discount_amount_applied = 0,
  taxable_base_amount = 0,
  tax_amount = 0,
  total_amount = 0,
  total_cost_amount = 0,
  profit_amount = 0,
  margin_basis_points = null,
  cost_complete = true
where not exists (
  select 1 from invoice_line_items ili
  where ili.invoice_id = invoices.id and ili.is_void = false
);
