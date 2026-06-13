create table if not exists online_payment_sessions (
  id text primary key,
  job_id text not null references jobs(id) on delete restrict,
  invoice_id text references invoices(id) on delete restrict,
  relay_payment_session_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  checkout_url text not null,
  status text not null check (status in ('created', 'paid', 'failed')),
  created_by_employee_id text references employees(id),
  created_by_name text not null,
  expires_at timestamptz not null,
  paid_at timestamptz,
  payment_id text references payments(id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists online_payment_sessions_relay_session_idx
  on online_payment_sessions(relay_payment_session_id);

create index if not exists online_payment_sessions_job_idx
  on online_payment_sessions(job_id, created_at desc);
