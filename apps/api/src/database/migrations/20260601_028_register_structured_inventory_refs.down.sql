-- Down: 20260601_028_register_structured_inventory_refs

alter table register_entries
  drop column if exists inventory_location_id,
  drop column if exists inventory_item_id;
