create unique index relay_shops_stripe_connected_account_idx
  on relay_shops (stripe_connected_account_id)
  where stripe_connected_account_id is not null;
