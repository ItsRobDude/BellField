-- Migration: 20260601_015_inventory_movement_hardening
-- Two corrections to the movement ledger before more write paths (receiving,
-- issue-to-job) build cost on top of it:
--
-- 1. Exact valuation. A weighted average rounded to cents can leave a residual when
--    mixed-cost stock is fully depleted (e.g. 1@$1 + 2@$2 = $5/3; removing all 3 at a
--    rounded $1.67 over-removes by a cent). Store extended_cost (the signed value delta
--    at 4 decimals) as the SOURCE OF TRUTH for on-hand value; an outbound movement
--    removes the exact proportional value, and a full depletion removes the exact
--    remaining value, so SUM(extended_cost) returns to zero with no drift. unit_cost is
--    kept as a per-unit display snapshot.
--
-- 2. DB-enforced movement shape/sign. The table previously trusted application code for
--    the location/job/sign rules per kind; pin them with a check constraint.

alter table inventory_movements
  add column if not exists extended_cost numeric(14, 4);

-- Backfill existing rows (inbound = qty*unit_cost; the few outbound rows so far were
-- valued at the average, so this is the same value they removed).
update inventory_movements
  set extended_cost = round(quantity * unit_cost, 4)
  where extended_cost is null;

alter table inventory_movements alter column extended_cost set not null;

alter table inventory_movements
  add constraint inventory_movements_shape check (
    case kind
      when 'receiveToInventory' then location_id is not null and job_id is null and quantity > 0
      when 'adjustmentGain' then location_id is not null and job_id is null and quantity > 0
      when 'adjustmentLoss' then location_id is not null and job_id is null and quantity < 0
      when 'transfer' then location_id is not null and transfer_group_id is not null
      when 'receiveToJob' then location_id is null and job_id is not null and quantity > 0
      when 'issueToJob' then location_id is not null and job_id is not null and quantity < 0
      when 'returnFromJob' then location_id is not null and job_id is not null and quantity > 0
      else false
    end
  );
