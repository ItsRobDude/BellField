-- Migration: 20260601_017_purchase_receipts
-- Receiving a purchase order (Milestone 9). Receiving is where ACTUAL cost enters the
-- system: each receipt line captures the real received quantity and unit cost, and the
-- effects are applied atomically —
--   * a part going to an inventory location  -> receiveToInventory movement (stock)
--   * a part going to a customer location WITH a job -> receiveToJob movement (job cost)
--   * a part going to a customer location with no job -> receipt line only (cost record)
--   * equipment (any destination) -> an equipment asset row (the bridge: pendingInstall
--     at a customer location, active at an inventory location); equipment is a serialized
--     asset, not quantity stock, so it does not post an inventory movement.
-- created_equipment_id links a receipt line to the equipment row it produced.

create table if not exists purchase_receipts (
  id text primary key,
  purchase_order_id text not null references purchase_orders(id),
  received_at timestamptz not null,
  received_by_employee_id text not null references employees(id),
  received_by_name text not null,
  note text,
  created_at timestamptz not null
);

create index if not exists purchase_receipts_po_idx on purchase_receipts (purchase_order_id);

create table if not exists purchase_receipt_lines (
  id text primary key,
  purchase_receipt_id text not null references purchase_receipts(id) on delete cascade,
  purchase_order_line_id text not null references purchase_order_lines(id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  created_equipment_id text references equipment(id),
  created_at timestamptz not null
);

create index if not exists purchase_receipt_lines_receipt_idx
  on purchase_receipt_lines (purchase_receipt_id);
