-- Migration: 20260601_003_invoice_line_position_active_only (rollback)
-- Restore the all-rows uniqueness on (invoice_id, line_position).
drop index if exists invoice_line_items_invoice_position_idx;

create unique index if not exists invoice_line_items_invoice_position_idx
  on invoice_line_items(invoice_id, line_position);
