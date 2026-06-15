-- Migration: 20260615_001_online_refund_requests
-- A PENDING online (Stripe-via-relay) refund of a provider-confirmed card
-- payment. The office opens a request here; the relay creates the Stripe refund;
-- the worker records the CONFIRMED refund into payment_refunds when the Stripe
-- refund event arrives and reconciles this request to 'succeeded' (or 'failed').
--
-- This table is the pending tracker only — never a half-real refund row
-- (payment_refunds always represents a confirmed refund). Lifecycle:
-- requested -> succeeded | failed.

create table if not exists online_refund_requests (
  id text primary key,
  payment_id text not null references payments(id) on delete restrict,
  job_id text not null references jobs(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text,
  -- Deterministic per (payment, amount, attempt) and REUSED on retry, so the
  -- relay and Stripe dedupe a re-submitted refund instead of double-refunding.
  idempotency_key text not null,
  -- The relay's own refund-request id and the Stripe refund id, learned when the
  -- relay accepts the request; the worker reconciles confirmed events to either.
  relay_refund_request_id text,
  provider_refund_id text,
  status text not null check (status in ('requested', 'succeeded', 'failed')),
  failure_reason text,
  -- Last error from the relay create-refund call. A transient/retryable failure
  -- leaves the request 'requested' (not 'failed') so it can be retried with the
  -- SAME idempotency key; only a terminal/non-retryable failure moves to 'failed'.
  last_error text,
  -- Worker apply/dead-letter bookkeeping (a distinct phase from the relay call).
  apply_attempt_count integer not null default 0,
  last_apply_error text,
  last_apply_attempt_at timestamptz,
  requested_by_employee_id text references employees(id),
  requested_by_name text not null,
  requested_at timestamptz not null,
  failed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint online_refund_requests_payment_key_unique unique (payment_id, idempotency_key)
);

create index if not exists online_refund_requests_payment_idx
  on online_refund_requests(payment_id);

-- Worker reconciliation lookups: by Stripe refund id (unique — one local request
-- per Stripe refund), by the relay's request id, and by outstanding
-- (payment, status) when neither id was stored yet (the API-timed-out case).
create unique index if not exists online_refund_requests_provider_refund_idx
  on online_refund_requests(provider_refund_id)
  where provider_refund_id is not null;

create index if not exists online_refund_requests_relay_request_idx
  on online_refund_requests(relay_refund_request_id)
  where relay_refund_request_id is not null;

create index if not exists online_refund_requests_payment_status_idx
  on online_refund_requests(payment_id, status);
