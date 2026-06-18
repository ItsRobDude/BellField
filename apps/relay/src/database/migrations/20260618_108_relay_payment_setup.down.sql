alter table relay_shops drop constraint if exists relay_shops_payments_setup_status_check;

alter table relay_shops
  drop column if exists payments_ready_at,
  drop column if exists payments_setup_created_at,
  drop column if exists payments_setup_url_expires_at,
  drop column if exists payments_setup_status;
