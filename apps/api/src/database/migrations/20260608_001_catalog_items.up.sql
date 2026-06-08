-- Migration: 20260608_001_catalog_items
-- Trade-neutral sellable/chargeable Catalog foundation. This is separate from inventory:
-- inventory_items model stock identity and valuation; catalog_items model what is sold to
-- customers and selected by technicians. Historical register rows keep a JSON snapshot so later
-- Catalog edits do not rewrite old work, invoice drafts, or posted invoices.

create table if not exists catalog_items (
  id text primary key,
  code text,
  name text not null check (length(trim(name)) > 0 and length(name) <= 160),
  kind text not null check (
    kind in ('service', 'part', 'equipment', 'labor', 'fee', 'discount', 'agreement', 'other')
  ),
  category text check (category is null or length(category) <= 80),
  trade_tags text[] not null default '{}',
  description text check (description is null or length(description) <= 1000),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 2000),
  unit_of_measure text check (unit_of_measure is null or length(unit_of_measure) <= 40),
  taxable_default boolean not null default true,
  default_sale_price numeric(12, 2),
  agreement_price numeric(12, 2) check (agreement_price is null or agreement_price >= 0),
  estimated_labor_hours numeric(8, 2) check (
    estimated_labor_hours is null or estimated_labor_hours >= 0
  ),
  cost_hint numeric(12, 2) check (cost_hint is null or cost_hint >= 0),
  linked_inventory_item_id text references inventory_items(id) on delete set null,
  income_category text check (income_category is null or length(income_category) <= 120),
  accounting_export_code text check (accounting_export_code is null or length(accounting_export_code) <= 120),
  field_visible boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    default_sale_price is null
    or (kind = 'discount' and default_sale_price <= 0)
    or (kind <> 'discount' and default_sale_price >= 0)
  )
);

create unique index if not exists catalog_items_code_key
  on catalog_items (lower(code))
  where code is not null;

create index if not exists catalog_items_field_browse_idx
  on catalog_items (is_active, field_visible, category, name);

alter table register_entries
  add column if not exists catalog_item_id text references catalog_items(id) on delete set null,
  add column if not exists catalog_snapshot jsonb,
  add constraint register_entries_catalog_snapshot_object
    check (catalog_snapshot is null or jsonb_typeof(catalog_snapshot) = 'object');

create index if not exists register_entries_catalog_item_idx
  on register_entries (catalog_item_id)
  where catalog_item_id is not null;
