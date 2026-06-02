-- Migration: 20260601_011_payment_void_audit
-- Capture who voided a payment and when. A voided payment is a money-ledger
-- correction, so it deserves the same actor audit as posting and recording.
-- All columns are nullable: a live (non-void) payment leaves them null, and the
-- void UPDATE fills them in. voided_by_employee_id references employees (never
-- hard-deleted), matching the posted/recorded audit columns.

alter table payments
  add column if not exists voided_by_employee_id text references employees(id),
  add column if not exists voided_by_name text,
  add column if not exists voided_at timestamptz;

-- Backfill any payment voided BEFORE this migration so the invariant below can be
-- added safely on an environment that already has void rows (the local dev DB is
-- clean, but a pilot may not be). The original actor/time are unrecoverable, so we
-- stamp a clear sentinel name and use the row's last-update time as the best-known
-- void time. The employee id stays null for these legacy rows — see the check below.
update payments
   set voided_by_name = coalesce(voided_by_name, 'Unknown (pre-audit)'),
       voided_at = coalesce(voided_at, updated_at)
 where is_void = true
   and (voided_by_name is null or voided_at is null);

-- Invariant: a void payment carries a displayable audit (who + when); a live one
-- carries none. The employee id is populated going forward (the void path always
-- sets it) but is intentionally NOT required here, so the backfill above does not
-- need a synthetic employee reference for legacy rows.
alter table payments
  add constraint payments_void_audit check (
    case
      when is_void then voided_by_name is not null and voided_at is not null
      else voided_by_employee_id is null and voided_by_name is null and voided_at is null
    end
  );
