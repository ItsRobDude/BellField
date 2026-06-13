drop index if exists relay_payment_events_undelivered_idx;
drop index if exists relay_payment_events_provider_payment_idx;
drop index if exists relay_payment_events_stripe_event_idx;
drop table if exists relay_payment_events;

drop index if exists relay_payment_sessions_stripe_session_idx;
drop index if exists relay_payment_sessions_idempotency_idx;
drop table if exists relay_payment_sessions;

alter table relay_shops drop constraint if exists relay_shops_payments_shape;
alter table relay_shops drop constraint if exists relay_shops_payments_status_check;
alter table relay_shops
  drop column if exists payments_enabled_at,
  drop column if exists payments_status,
  drop column if exists stripe_connected_account_id;
