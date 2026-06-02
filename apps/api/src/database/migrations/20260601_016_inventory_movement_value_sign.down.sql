-- Migration: 20260601_016_inventory_movement_value_sign (rollback)
alter table inventory_movements drop constraint if exists inventory_movements_value_sign;
