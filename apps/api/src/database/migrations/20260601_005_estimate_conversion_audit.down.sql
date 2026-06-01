-- Migration: 20260601_005_estimate_conversion_audit (rollback)
alter table estimates
  drop column if exists converted_to_invoice_id,
  drop column if exists converted_at,
  drop column if exists converted_by_employee_id,
  drop column if exists converted_by_name;
