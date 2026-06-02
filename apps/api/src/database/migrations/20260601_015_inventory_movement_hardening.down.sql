-- Migration: 20260601_015_inventory_movement_hardening (rollback)
alter table inventory_movements drop constraint if exists inventory_movements_shape;
alter table inventory_movements drop column if exists extended_cost;
