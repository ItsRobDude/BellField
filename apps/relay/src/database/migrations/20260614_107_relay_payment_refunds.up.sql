-- Migration: 20260614_107_relay_payment_refunds
-- Online refund support on the relay (Phase 6b slice 2). Refunds are kept in
-- their own tables rather than overloading relay_payment_events, which is
-- payment-only (positive amount, required provider_payment_id, unique per
-- provider_payment_id). An install requests a refund against a relay-owned paid
-- session; the relay calls Stripe on the connected account and records the
-- request, then stores provider-confirmed refund events (succeeded/failed) for
-- the install worker to poll/ack at-least-once.

create table if not exists relay_payment_refund_requests (
  id text primary key,
  shop_id text not null references relay_shops(id) on delete cascade,
  payment_session_id text not null references relay_payment_sessions(id) on delete cascade,
  idempotency_key text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text,
  stripe_connected_account_id text not null,
  stripe_payment_intent_id text not null,
  stripe_refund_id text,
  application_fee_refunded_cents integer check (
    application_fee_refunded_cents is null or application_fee_refunded_cents >= 0
  ),
  status text not null check (status in ('requested', 'succeeded', 'failed')),
  failure_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index relay_payment_refund_requests_idempotency_idx
  on relay_payment_refund_requests (shop_id, idempotency_key);

create unique index relay_payment_refund_requests_stripe_refund_idx
  on relay_payment_refund_requests (stripe_refund_id)
  where stripe_refund_id is not null;

create table if not exists relay_payment_refund_events (
  id text primary key,
  shop_id text not null references relay_shops(id) on delete cascade,
  -- Every refund event in this slice originates from a BellField refund request.
  -- Out-of-band Stripe-dashboard refunds are deferred reconciliation work: the
  -- webhook handler logs and ignores a refund with no matching request.
  refund_request_id text not null references relay_payment_refund_requests(id) on delete cascade,
  payment_session_id text not null references relay_payment_sessions(id) on delete cascade,
  stripe_event_id text not null,
  stripe_refund_id text not null,
  provider_payment_id text not null,
  provider_session_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  application_fee_refunded_cents integer check (
    application_fee_refunded_cents is null or application_fee_refunded_cents >= 0
  ),
  status text not null check (status in ('succeeded', 'failed')),
  failure_reason text,
  occurred_at timestamptz not null,
  created_at timestamptz not null,
  delivered_at timestamptz
);

-- Each Stripe webhook event lands at most once.
create unique index relay_payment_refund_events_stripe_event_idx
  on relay_payment_refund_events (stripe_event_id);

-- One stored refund event per shop + refund: several webhook events
-- (refund.created/updated/failed) can describe the same refund, but the install
-- should pick it up exactly once.
create unique index relay_payment_refund_events_refund_idx
  on relay_payment_refund_events (shop_id, stripe_refund_id);

-- Fast poll of a shop's undelivered refund events (mirrors the payment-event poll).
create index relay_payment_refund_events_undelivered_idx
  on relay_payment_refund_events (shop_id)
  where delivered_at is null;
