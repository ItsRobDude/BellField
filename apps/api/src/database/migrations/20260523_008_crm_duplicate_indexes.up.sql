create index if not exists customers_normalized_name_idx
  on customers ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));

create index if not exists customers_normalized_billing_address_idx
  on customers ((regexp_replace(lower(concat_ws(' ', billing_address_line1, billing_city, billing_state, billing_postal_code)), '[^a-z0-9]', '', 'g')));

create index if not exists locations_normalized_name_idx
  on locations ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));

create index if not exists locations_normalized_address_idx
  on locations ((regexp_replace(lower(concat_ws(' ', address_line1, city, state, postal_code)), '[^a-z0-9]', '', 'g')));
