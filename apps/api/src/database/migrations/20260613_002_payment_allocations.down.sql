drop index if exists payment_allocations_payment_idx;
drop index if exists payment_allocations_invoice_idx;
drop table if exists payment_allocations;

drop index if exists payments_job_active_idx;
drop index if exists payments_provider_session_idx;
drop index if exists payments_provider_payment_idx;

alter table payments drop constraint if exists payments_provider_shape;
alter table payments drop constraint if exists payments_actor_source_shape;
alter table payments drop constraint if exists payments_fee_amounts_check;
alter table payments drop constraint if exists payments_currency_check;
alter table payments drop constraint if exists payments_provider_check;
alter table payments drop constraint if exists payments_source_check;

-- The old model required one invoice anchor and one employee recorder. Refuse
-- rollback if new rows no longer satisfy that old shape.
alter table payments
  alter column invoice_id set not null,
  alter column recorded_by_employee_id set not null;

alter table payments
  drop column if exists application_fee_amount,
  drop column if exists processor_fee_amount,
  drop column if exists currency,
  drop column if exists provider_session_id,
  drop column if exists provider_payment_id,
  drop column if exists provider,
  drop column if exists source,
  drop column if exists job_id;
