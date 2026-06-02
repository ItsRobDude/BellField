-- Migration: 20260601_013_inventory_movements (rollback)
drop index if exists inventory_movements_source_idx;
drop index if exists inventory_movements_job_idx;
drop index if exists inventory_movements_item_location_idx;
drop table if exists inventory_movements;
