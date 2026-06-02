-- Migration: 20260601_016_inventory_movement_value_sign
-- Tighten the movement ledger: extended_cost (the value delta) must share the sign of
-- quantity. Migration 015 pinned quantity sign per kind but left value sign to app code,
-- so the DB would still accept an adjustmentLoss with negative quantity but positive
-- value. Inbound (quantity > 0) adds value; outbound (quantity < 0) removes value.
-- quantity is already constrained non-zero, so this covers every row.

alter table inventory_movements
  add constraint inventory_movements_value_sign check (
    (quantity > 0 and extended_cost >= 0) or (quantity < 0 and extended_cost <= 0)
  );
