drop index if exists estimate_line_items_catalog_item_idx;

alter table estimate_line_items
  drop constraint if exists estimate_line_items_catalog_snapshot_object;

alter table estimate_line_items
  drop column if exists catalog_snapshot,
  drop column if exists catalog_item_id;
