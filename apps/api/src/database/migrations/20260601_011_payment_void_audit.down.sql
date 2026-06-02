-- Migration: 20260601_011_payment_void_audit (rollback)
alter table payments drop constraint if exists payments_void_audit;
alter table payments drop column if exists voided_by_employee_id;
alter table payments drop column if exists voided_by_name;
alter table payments drop column if exists voided_at;
