-- Migration: 20260601_011_payment_void_audit
-- Capture who voided a payment and when. A voided payment is a money-ledger
-- correction, so it deserves the same actor audit as posting and recording.
-- All columns are nullable: a live (non-void) payment leaves them null, and the
-- void UPDATE fills them in one step. voided_by_employee_id references employees
-- (never hard-deleted), matching the posted/recorded audit columns.

alter table payments
  add column if not exists voided_by_employee_id text references employees(id),
  add column if not exists voided_by_name text,
  add column if not exists voided_at timestamptz;

-- Backstop the invariant: a void payment carries its audit; a live one carries none.
alter table payments
  add constraint payments_void_audit check (
    case
      when is_void then voided_by_employee_id is not null and voided_by_name is not null and voided_at is not null
      else voided_by_employee_id is null and voided_by_name is null and voided_at is null
    end
  );
