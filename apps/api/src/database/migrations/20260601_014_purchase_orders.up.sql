-- Migration: 20260601_014_purchase_orders
-- Purchase orders (Milestone 9). A PO records intended procurement: vendor, a single
-- end destination, optional job, and lines with EXPECTED quantity/cost (planning only).
-- A PO never touches inventory or job cost — that happens at receiving (a later slice).
--
-- No-split rule (product rule §12): a PO ends at exactly ONE destination. Trucks/vans
-- are inventory_locations, so a destination is either an inventory location OR a
-- customer service location — enforced by a check constraint. A PO does not require a job.

create table if not exists purchase_orders (
  id text primary key,
  po_number text,
  vendor_name text not null,
  status text not null check (status in ('draft', 'ordered', 'received', 'closed')),
  -- Exactly one destination (no-split):
  destination_inventory_location_id text references inventory_locations(id),
  destination_location_id text references locations(id),
  job_id text references jobs(id),
  notes text,
  ordered_at timestamptz,
  ordered_by_employee_id text references employees(id),
  ordered_by_name text,
  created_by_employee_id text not null references employees(id),
  created_by_name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint purchase_orders_one_destination check (
    (destination_inventory_location_id is not null)::int
      + (destination_location_id is not null)::int = 1
  )
);

create index if not exists purchase_orders_status_idx on purchase_orders (status, created_at desc);
create index if not exists purchase_orders_job_idx on purchase_orders (job_id) where job_id is not null;

create table if not exists purchase_order_lines (
  id text primary key,
  purchase_order_id text not null references purchase_orders(id) on delete cascade,
  line_position integer not null,
  -- Optional catalog link; a stocked part should reference an item so receiving can post
  -- it to the ledger. Equipment lines carry their own metadata below.
  item_id text references inventory_items(id),
  kind text not null check (kind in ('part', 'equipment')),
  description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  expected_unit_cost numeric(12, 2) not null check (expected_unit_cost >= 0),
  equipment_type text,
  equipment_brand text,
  equipment_model text,
  equipment_serial text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists purchase_order_lines_po_idx on purchase_order_lines (purchase_order_id);
