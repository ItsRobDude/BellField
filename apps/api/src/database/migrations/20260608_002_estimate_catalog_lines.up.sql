-- Migration: 20260608_002_estimate_catalog_lines
-- Adds optional Catalog provenance to estimate lines.
--
-- Estimate lines remain frozen financial snapshots. The Catalog item id gives a
-- live reference when the item still exists, while catalog_snapshot preserves the
-- sell-side details that seeded the quote if the Catalog later changes.

alter table estimate_line_items
  add column if not exists catalog_item_id text references catalog_items(id) on delete set null,
  add column if not exists catalog_snapshot jsonb;

alter table estimate_line_items
  add constraint estimate_line_items_catalog_snapshot_object
  check (catalog_snapshot is null or jsonb_typeof(catalog_snapshot) = 'object');

create index if not exists estimate_line_items_catalog_item_idx
  on estimate_line_items(catalog_item_id)
  where catalog_item_id is not null;
