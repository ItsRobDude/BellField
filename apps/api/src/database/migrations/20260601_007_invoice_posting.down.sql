-- Migration: 20260601_007_invoice_posting (rollback)
alter table invoices drop constraint if exists invoices_posted_snapshot;

alter table invoices
  drop column if exists posted_at,
  drop column if exists posted_by_employee_id,
  drop column if exists posted_by_name,
  drop column if exists bill_to_customer_id,
  drop column if exists bill_to_customer_name,
  drop column if exists bill_to_account_type,
  drop column if exists bill_to_address_line1,
  drop column if exists bill_to_city,
  drop column if exists bill_to_state,
  drop column if exists bill_to_postal_code,
  drop column if exists service_location_id,
  drop column if exists service_location_name,
  drop column if exists service_location_address_line1,
  drop column if exists service_location_city,
  drop column if exists service_location_state,
  drop column if exists service_location_postal_code,
  drop column if exists job_number,
  drop column if exists work_order_number;
