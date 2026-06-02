-- Migration: 20260601_018_inventory_transfer_shape (rollback)
-- Restore the 015 shape constraint (transfer without the job_id-null clause).
alter table inventory_movements drop constraint if exists inventory_movements_shape;
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
