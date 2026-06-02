-- Migration: 20260601_013_inventory_movements
-- The immutable inventory movement ledger (Milestone 9). On-hand quantity and value
-- are DERIVED by summing movements per (item, location); they are never stored as a
-- mutable balance. Corrections are reversing movements, never edits or deletes.
--
-- Sign convention: quantity is signed relative to a stock location — positive means
-- "into this location", negative means "out of this location". A row that has no
-- location_id (a direct-to-job receipt) does not affect any location's on-hand; it is
-- purely a job-cost event.
--
-- Valuation (v1): weighted-average cost per (item, location). Every movement carries a
-- unit_cost snapshot. Inbound movements set the cost they arrived at; outbound
-- movements (issue/transfer-out/loss) are valued at the location's current average so
-- the running value stays consistent and historical cost is never rewritten.
--
-- A transfer is two movements sharing transfer_group_id (out of source, into dest),
-- carrying the same unit_cost so cost travels with the goods.

create table if not exists inventory_movements (
  id text primary key,
  item_id text not null references inventory_items(id),
  kind text not null check (kind in (
    'receiveToInventory',
    'receiveToJob',
    'issueToJob',
    'transfer',
    'adjustmentGain',
    'adjustmentLoss',
    'returnFromJob'
  )),
  quantity numeric(14, 4) not null check (quantity <> 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  -- The stock location this movement affects. Null only for a direct-to-job receipt
  -- (receiveToJob), which is a job-cost event with no stock impact.
  location_id text references inventory_locations(id),
  -- Set for job-facing movements (issueToJob, receiveToJob, returnFromJob).
  job_id text references jobs(id),
  -- Provenance: what produced this movement.
  source_kind text check (source_kind in ('purchaseReceipt', 'adjustment', 'transfer', 'issue', 'return')),
  source_id text,
  -- Pairs the two legs of a transfer.
  transfer_group_id text,
  -- A reversing movement points at the one it reverses (corrections, never deletes).
  reversal_of_movement_id text references inventory_movements(id),
  actor_employee_id text not null references employees(id),
  actor_name text not null,
  note text,
  occurred_at timestamptz not null,
  created_at timestamptz not null
);

-- On-hand reads sum by (item, location); job-cost reads sum by job.
create index if not exists inventory_movements_item_location_idx
  on inventory_movements (item_id, location_id);
create index if not exists inventory_movements_job_idx
  on inventory_movements (job_id) where job_id is not null;
create index if not exists inventory_movements_source_idx
  on inventory_movements (source_kind, source_id);
