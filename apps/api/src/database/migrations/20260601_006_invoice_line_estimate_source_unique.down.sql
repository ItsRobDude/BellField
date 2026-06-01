-- Migration: 20260601_006_invoice_line_estimate_source_unique (rollback)
drop index if exists invoice_line_items_estimate_source_idx;
