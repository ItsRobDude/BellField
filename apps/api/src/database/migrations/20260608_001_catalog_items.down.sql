drop index if exists register_entries_catalog_item_idx;

alter table register_entries
  drop constraint if exists register_entries_catalog_snapshot_object,
  drop column if exists catalog_snapshot,
  drop column if exists catalog_item_id;

drop index if exists catalog_items_field_browse_idx;
drop index if exists catalog_items_code_key;
drop table if exists catalog_items;
