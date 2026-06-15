-- Migration: 20260614_004_payment_refunds
-- Return money on a job, reversing all or part of a payment. A refund is an
-- append-only ledger row (NOT a mutation of a payment or a posted invoice): the
-- job's amount due is derived as net billed − (non-void payments − non-void
-- refunds). payment_refund_allocations reverse the original payment's
-- allocations so each posted charge invoice's remaining balance stays exact.
--
-- A payment_refunds row always represents a CONFIRMED refund: a manual refund is
-- confirmed when the office records it; an online (Stripe) refund row is created
-- by the worker only when the refund event is confirmed (idempotent on
-- provider_refund_id), mirroring how provider-confirmed payments are recorded.

create table if not exists payment_refunds (
  id text primary key,
  payment_id text not null references payments(id) on delete restrict,
  job_id text not null references jobs(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'check', 'card', 'ach', 'other')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  source text not null check (source in ('manual', 'bellfield_payments')),
  provider text check (provider is null or provider in ('stripe')),
  provider_refund_id text,
  provider_payment_id text,
  application_fee_refunded numeric(12, 2) check (
    application_fee_refunded is null or application_fee_refunded >= 0
  ),
  reason text,
  refunded_by_employee_id text references employees(id),
  refunded_by_name text not null,
  refunded_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint payment_refunds_provider_shape check (
    case
      when source = 'bellfield_payments'
        then provider = 'stripe' and provider_refund_id is not null
      else provider is null and refunded_by_employee_id is not null
    end
  )
);

-- The worker records each Stripe refund event exactly once.
create unique index if not exists payment_refunds_provider_refund_idx
  on payment_refunds(provider, provider_refund_id)
  where provider is not null and provider_refund_id is not null;

-- Fast sum of a job's active refunds (the balance read subtracts these).
create index if not exists payment_refunds_job_idx
  on payment_refunds(job_id);

create index if not exists payment_refunds_payment_idx
  on payment_refunds(payment_id);

create table if not exists payment_refund_allocations (
  id text primary key,
  refund_id text not null references payment_refunds(id) on delete restrict,
  invoice_id text not null references invoices(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null,
  constraint payment_refund_allocations_refund_invoice_unique unique (refund_id, invoice_id)
);

create index if not exists payment_refund_allocations_invoice_idx
  on payment_refund_allocations(invoice_id);

create index if not exists payment_refund_allocations_refund_idx
  on payment_refund_allocations(refund_id);
