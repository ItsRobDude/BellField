-- Migration: 20260601_012_inventory_foundation (rollback)
drop index if exists inventory_locations_active_idx;
drop table if exists inventory_locations;
drop index if exists inventory_items_active_name_idx;
drop table if exists inventory_items;
