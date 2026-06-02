-- Migration: 20260601_012_inventory_foundation
-- Milestone 9 foundation: a catalog of inventory items and first-class non-customer
-- stock locations (warehouses, technician trucks/vans). Customer service locations
-- stay in `locations` and are NOT stock locations; a PO that ends at a customer
-- location is handled separately (M9 receiving), not by turning it into stock.
--
-- These tables hold IDENTITY only. On-hand quantity and actual cost are derived from
-- the inventory movement ledger (a later M9 migration), never stored here as a live
-- balance. default_unit_cost is a planning convenience for prefilling PO lines.

create table if not exists inventory_items (
  id text primary key,
  sku text,
  name text not null,
  kind text not null check (kind in ('part', 'equipment')),
  unit_of_measure text,
  default_unit_cost numeric(12, 2) check (default_unit_cost is null or default_unit_cost >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Fast active-catalog browse/search by name.
create index if not exists inventory_items_active_name_idx on inventory_items (is_active, name);

create table if not exists inventory_locations (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('warehouse', 'truck', 'other')),
  -- A truck/van may belong to a technician (employees are never hard-deleted).
  assigned_employee_id text references employees(id),
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists inventory_locations_active_idx on inventory_locations (is_active, kind);
