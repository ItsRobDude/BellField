-- Migration: 20260601_006_invoice_line_estimate_source_unique
-- Backstop the one-conversion-per-estimate-line invariant at the database level.
--
-- Estimate-to-invoice conversion is guarded in the service (only an unconverted,
-- approved estimate converts) and runs in a single transaction, but a unique
-- index makes a duplicate physically impossible even under a race or a future
-- code path: at most one active (non-void) invoice line may point at a given
-- estimate line. Mirrors the existing register-source partial unique index.
create unique index if not exists invoice_line_items_estimate_source_idx
  on invoice_line_items(source_estimate_line_item_id)
  where source_estimate_line_item_id is not null and is_void = false;
