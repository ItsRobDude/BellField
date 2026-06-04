-- A purchase order's job only has meaning on a customer-destination PO: receiving bridges its
-- cost and equipment to that job. An inventory-destination PO buys stock for the warehouse and
-- never posts job cost, so a job_id there was silently ignored (and, for an equipment line with a
-- catalog item, could double-count as both a stock asset and a job-cost movement). Clear any such
-- rows, then forbid the combination so the data can't drift back.

update purchase_orders
set job_id = null
where destination_inventory_location_id is not null
  and job_id is not null;

alter table purchase_orders
  add constraint purchase_orders_job_requires_customer_destination
  check (job_id is null or destination_location_id is not null);
