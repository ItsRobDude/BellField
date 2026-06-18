alter table relay_shops
  add column if not exists payments_setup_status text not null default 'notStarted',
  add column if not exists payments_setup_url_expires_at timestamptz,
  add column if not exists payments_setup_created_at timestamptz,
  add column if not exists payments_ready_at timestamptz;

alter table relay_shops
  add constraint relay_shops_payments_setup_status_check check (
    payments_setup_status in (
      'notStarted',
      'actionRequired',
      'pendingReview',
      'ready',
      'disabled',
      'providerError'
    )
  );

update relay_shops
set payments_setup_status = case
      when payments_status = 'enabled' then 'ready'
      when stripe_connected_account_id is not null then 'actionRequired'
      else payments_setup_status
    end,
    payments_setup_created_at = case
      when stripe_connected_account_id is not null then coalesce(payments_setup_created_at, created_at)
      else payments_setup_created_at
    end,
    payments_ready_at = case
      when payments_status = 'enabled' then coalesce(payments_ready_at, payments_enabled_at)
      else payments_ready_at
    end;
