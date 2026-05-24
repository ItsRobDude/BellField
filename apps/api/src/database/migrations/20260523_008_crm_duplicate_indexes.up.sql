create index if not exists customers_normalized_name_idx
  on customers ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));

create index if not exists locations_normalized_name_idx
  on locations ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));
