-- Migration: 20260613_002_payment_allocations
-- Move payments from a single-invoice shortcut to the durable money model:
-- a payment is money received for a job, and payment_allocations record how
-- that receipt applies to one or more posted charge invoices.
--
-- Existing rows are backfilled as one allocation against their current invoice,
-- preserving the exact previous meaning while allowing new full-balance online
-- payments to span the posted main invoice and adjustments.

alter table payments
  add column if not exists job_id text references jobs(id) on delete restrict,
  add column if not exists source text not null default 'manual',
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_session_id text,
  add column if not exists currency text not null default 'USD',
  add column if not exists processor_fee_amount numeric(12, 2),
  add column if not exists application_fee_amount numeric(12, 2);

update payments p
   set job_id = i.job_id
  from invoices i
 where p.invoice_id = i.id
   and p.job_id is null;

alter table payments
  alter column job_id set not null,
  alter column invoice_id drop not null,
  alter column recorded_by_employee_id drop not null;

alter table payments
  add constraint payments_source_check check (source in ('manual', 'bellfield_payments')),
  add constraint payments_provider_check check (provider is null or provider in ('stripe')),
  add constraint payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint payments_fee_amounts_check check (
    (processor_fee_amount is null or processor_fee_amount >= 0)
    and (application_fee_amount is null or application_fee_amount >= 0)
  ),
  add constraint payments_actor_source_shape check (
    recorded_by_name is not null
    and (
      source <> 'manual'
      or recorded_by_employee_id is not null
    )
  ),
  add constraint payments_provider_shape check (
    case
      when source = 'bellfield_payments'
        then provider = 'stripe' and provider_payment_id is not null
      else provider is null
    end
  );

create unique index if not exists payments_provider_payment_idx
  on payments(provider, provider_payment_id)
  where provider is not null and provider_payment_id is not null;

create unique index if not exists payments_provider_session_idx
  on payments(provider, provider_session_id)
  where provider is not null and provider_session_id is not null;

create index if not exists payments_job_active_idx
  on payments(job_id)
  where is_void = false;

create table if not exists payment_allocations (
  id text primary key,
  payment_id text not null references payments(id) on delete restrict,
  invoice_id text not null references invoices(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null,
  constraint payment_allocations_payment_invoice_unique unique (payment_id, invoice_id)
);

insert into payment_allocations (id, payment_id, invoice_id, amount, created_at)
select
  'payment-allocation-' || md5(p.id || ':' || p.invoice_id),
  p.id,
  p.invoice_id,
  p.amount,
  p.created_at
from payments p
where p.invoice_id is not null
  and not exists (
    select 1
    from payment_allocations pa
    where pa.payment_id = p.id and pa.invoice_id = p.invoice_id
  );

create index if not exists payment_allocations_invoice_idx
  on payment_allocations(invoice_id);

create index if not exists payment_allocations_payment_idx
  on payment_allocations(payment_id);
