-- Drop the job-requires-customer-destination guard. The job_id values nulled out by the up
-- migration are not restored (the original associations were no-ops anyway).
alter table purchase_orders
  drop constraint if exists purchase_orders_job_requires_customer_destination;
