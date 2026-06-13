alter table relay_shops
  add column if not exists stripe_connected_account_id text,
  add column if not exists payments_status text not null default 'disabled',
  add column if not exists payments_enabled_at timestamptz;

alter table relay_shops
  add constraint relay_shops_payments_status_check check (payments_status in ('disabled', 'enabled')),
  add constraint relay_shops_payments_shape check (
    (payments_status = 'disabled' and payments_enabled_at is null)
    or (payments_status = 'enabled' and stripe_connected_account_id is not null and payments_enabled_at is not null)
  );

create table if not exists relay_payment_sessions (
  id text primary key,
  shop_id text not null references relay_shops(id) on delete cascade,
  idempotency_key text not null,
  job_ref text not null,
  invoice_ref text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text not null,
  customer_email text,
  success_url text not null,
  cancel_url text not null,
  stripe_connected_account_id text not null,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id text,
  checkout_url text not null,
  status text not null check (status in ('created', 'paid', 'expired', 'canceled')),
  application_fee_cents integer not null check (application_fee_cents >= 0),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index relay_payment_sessions_idempotency_idx
  on relay_payment_sessions (shop_id, idempotency_key);

create unique index relay_payment_sessions_stripe_session_idx
  on relay_payment_sessions (stripe_checkout_session_id);

create table if not exists relay_payment_events (
  id text primary key,
  shop_id text not null references relay_shops(id) on delete cascade,
  payment_session_id text not null references relay_payment_sessions(id) on delete cascade,
  stripe_event_id text not null,
  provider_payment_id text not null,
  provider_session_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  application_fee_cents integer not null check (application_fee_cents >= 0),
  processor_fee_cents integer check (processor_fee_cents is null or processor_fee_cents >= 0),
  paid_at timestamptz not null,
  created_at timestamptz not null,
  delivered_at timestamptz
);

create unique index relay_payment_events_stripe_event_idx
  on relay_payment_events (stripe_event_id);

create unique index relay_payment_events_provider_payment_idx
  on relay_payment_events (shop_id, provider_payment_id);

create index relay_payment_events_undelivered_idx
  on relay_payment_events (shop_id)
  where delivered_at is null;
