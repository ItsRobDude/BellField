create index if not exists customers_name_prefix_idx
  on customers (lower(name) text_pattern_ops);

create index if not exists customers_email_prefix_idx
  on customers (lower(coalesce(email, '')) text_pattern_ops);

create index if not exists customers_phone_digits_prefix_idx
  on customers ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) text_pattern_ops);

create index if not exists customers_billing_postal_prefix_idx
  on customers (lower(billing_postal_code) text_pattern_ops);

create index if not exists locations_customer_id_idx
  on locations(customer_id);

create index if not exists locations_name_prefix_idx
  on locations (lower(name) text_pattern_ops);

create index if not exists locations_address_prefix_idx
  on locations (lower(address_line1) text_pattern_ops);

create index if not exists locations_postal_prefix_idx
  on locations (lower(postal_code) text_pattern_ops);

create index if not exists locations_email_prefix_idx
  on locations (lower(coalesce(email, '')) text_pattern_ops);

create index if not exists locations_phone_digits_prefix_idx
  on locations ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) text_pattern_ops);

create index if not exists contacts_display_name_prefix_idx
  on contacts (lower(display_name) text_pattern_ops);

create index if not exists contacts_email_prefix_idx
  on contacts (lower(coalesce(email, '')) text_pattern_ops);

create index if not exists contacts_phone_digits_prefix_idx
  on contacts ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) text_pattern_ops);
