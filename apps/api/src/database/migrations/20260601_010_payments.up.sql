-- Migration: 20260601_010_payments
-- Record customer payments against posted invoices (Milestone 8, online-only v1 =
-- manually recorded; no payment-gateway integration yet).
--
-- A payment is an append-only ledger row, NOT a mutation of invoice totals. The
-- amount owed on a job is derived: net billed (posted main + adjustments − credits)
-- minus the sum of that job's non-void payments. So recording or voiding a payment
-- never rewrites a posted invoice — the locked accounting record stays intact.
--
-- Every payment references the posted invoice it was applied to (`on delete restrict`,
-- consistent with the rest of the invoice graph — invoices are never hard-deleted).
-- Direction is always "received": amount is strictly positive. A correction to a
-- payment is a void (is_void), and a refund is modeled later; v1 does not add a
-- refund kind. recorded_by_employee_id references employees (never hard-deleted),
-- matching the posting/adjustment audit columns.

create table if not exists payments (
  id text primary key,
  invoice_id text not null references invoices(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'check', 'card', 'ach', 'other')),
  received_at timestamptz not null,
  reference text,
  memo text,
  recorded_by_employee_id text not null references employees(id),
  recorded_by_name text not null,
  is_void boolean not null default false,
  void_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Fast lookup of a posted invoice's active payments (the balance read sums these).
create index if not exists payments_invoice_active_idx
  on payments(invoice_id)
  where is_void = false;
