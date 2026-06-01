-- Migration: 20260601_003_invoice_line_position_active_only
-- Scope the invoice line position uniqueness to ACTIVE (non-void) lines.
--
-- The original index was unique on (invoice_id, line_position) across all rows,
-- including soft-voided ones. That would block "replace draft" (estimate
-- conversion) and any edit flow that soft-voids existing lines and re-inserts
-- replacements starting at position 0 — the new active rows would collide with
-- the voided rows still holding those positions. Positions only need to be
-- unique among the lines that are actually live, so restrict the index to
-- is_void = false. Voided lines keep their old position for history but no
-- longer reserve it.

drop index if exists invoice_line_items_invoice_position_idx;

create unique index if not exists invoice_line_items_invoice_position_idx
  on invoice_line_items(invoice_id, line_position)
  where is_void = false;
