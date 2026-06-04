-- Codex review follow-up to migration 024. Clearing the no-op job_id on inventory-destination
-- purchase orders fixed the PO header, but the old buggy receive path (an equipment line with a
-- catalog item on an inventory-destination PO) had ALSO written a stray `receiveToJob` movement
-- into the ledger. The job-cost rollup sums receiveToJob/issueToJob by job_id, so those phantom
-- rows keep inflating the job's material cost (live and any frozen snapshot) even though the PO
-- header no longer shows a job.
--
-- These rows should never have existed: equipment received to stock produces an asset only, no
-- inventory movement. The ledger's shape constraint can't represent a reversing entry for a
-- receiveToJob (it must be job-only and positive, and returnFromJob is excluded from the
-- rollup), so the bug-created phantoms are deleted outright. They are leaves — nothing points at
-- them (reversal_of_movement_id is null), and the equipment asset + receipt line they came from
-- are left intact. Scope is tight: only receiveToJob movements sourced from a purchase receipt
-- whose PO ends at an inventory location (legitimate receiveToJob rows ride customer-destination
-- POs, whose destination_inventory_location_id is null, and are untouched).
delete from inventory_movements m
where m.kind = 'receiveToJob'
  and m.source_kind = 'purchaseReceipt'
  and exists (
    select 1
    from purchase_receipt_lines prl
    join purchase_receipts pr on pr.id = prl.purchase_receipt_id
    join purchase_orders po on po.id = pr.purchase_order_id
    where prl.id = m.source_id
      and po.destination_inventory_location_id is not null
  );
