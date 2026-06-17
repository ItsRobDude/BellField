-- Migration: 20260616_004_invoice_numbers
-- Durable invoice numbers, assigned when an invoice is POSTED (the moment it
-- becomes the locked accounting record — drafts stay numberless because they are
-- still mutable/deletable and must never burn a number).
--
-- Model (Xero-style, the pattern QuickBooks/Xero converged on): ONE shared,
-- gapless counter across all posted invoice kinds, with the human prefix varying
-- by kind (INV-/ADJ-/CR-) in app code. A single shared sequence is what an
-- accountant reconciles most easily; the kind-specific prefix gives credits the
-- distinct look they expect without a second counter to manage.

-- The shared counter. A single row, locked + incremented inside the post
-- transaction (via `next_value = next_value + 1` returning the prior value), so
-- concurrent posts serialize and a rolled-back post leaves no gap.
create table if not exists invoice_number_series (
  id text primary key,
  next_value bigint not null default 1 check (next_value >= 1),
  updated_at timestamptz not null default now()
);

insert into invoice_number_series (id, next_value)
  values ('default', 1)
  on conflict (id) do nothing;

-- invoice_sequence is the raw shared integer (sort/range); invoice_number is the
-- formatted, customer-facing value (e.g. 'INV-1042'). Both null for drafts and
-- for invoices posted before this migration (numbering is forward-only).
alter table invoices
  add column if not exists invoice_sequence bigint,
  add column if not exists invoice_number text;

create unique index if not exists invoices_invoice_number_idx
  on invoices(invoice_number)
  where invoice_number is not null;

-- One shared counter means the raw sequence is globally unique too, so the DB
-- enforces the product rule directly: a bug that formatted two kinds at the same
-- number (e.g. INV-1042 and CR-1042 — distinct invoice_number strings) would
-- still collide here and be rejected.
create unique index if not exists invoices_invoice_sequence_idx
  on invoices(invoice_sequence)
  where invoice_sequence is not null;
