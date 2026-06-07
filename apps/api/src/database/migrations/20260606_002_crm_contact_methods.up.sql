create table if not exists crm_contact_methods (
  id text primary key,
  owner_kind text not null check (owner_kind in ('customer', 'location', 'contact')),
  customer_id text references customers(id) on delete cascade,
  location_id text references locations(id) on delete cascade,
  contact_id text references contacts(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email', 'fax')),
  label text not null default '',
  value text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_kind = 'customer' and customer_id is not null and location_id is null and contact_id is null)
    or (owner_kind = 'location' and location_id is not null and customer_id is null and contact_id is null)
    or (owner_kind = 'contact' and contact_id is not null and customer_id is null and location_id is null)
  )
);

create unique index if not exists crm_contact_methods_customer_primary_idx
  on crm_contact_methods(customer_id, kind)
  where owner_kind = 'customer' and is_primary = true and is_active = true;

create unique index if not exists crm_contact_methods_location_primary_idx
  on crm_contact_methods(location_id, kind)
  where owner_kind = 'location' and is_primary = true and is_active = true;

create unique index if not exists crm_contact_methods_contact_primary_idx
  on crm_contact_methods(contact_id, kind)
  where owner_kind = 'contact' and is_primary = true and is_active = true;

create index if not exists crm_contact_methods_value_prefix_idx
  on crm_contact_methods (lower(value) text_pattern_ops)
  where is_active = true;

create index if not exists crm_contact_methods_phone_digits_prefix_idx
  on crm_contact_methods ((regexp_replace(value, '[^0-9]', '', 'g')) text_pattern_ops)
  where is_active = true and kind in ('phone', 'fax');

insert into crm_contact_methods (
  id,
  owner_kind,
  customer_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--phone-primary'),
  'customer',
  id,
  'phone',
  'Main',
  phone,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from customers
where nullif(trim(phone), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  customer_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--email-primary'),
  'customer',
  id,
  'email',
  'Main',
  email,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from customers
where nullif(trim(email), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  customer_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--fax-primary'),
  'customer',
  id,
  'fax',
  'Fax',
  fax,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from customers
where nullif(trim(fax), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  location_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--phone-primary'),
  'location',
  id,
  'phone',
  'Main',
  phone,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from locations
where nullif(trim(phone), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  location_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--email-primary'),
  'location',
  id,
  'email',
  'Main',
  email,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from locations
where nullif(trim(email), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  location_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--fax-primary'),
  'location',
  id,
  'fax',
  'Fax',
  fax,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from locations
where nullif(trim(fax), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  contact_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--phone-primary'),
  'contact',
  id,
  'phone',
  'Main',
  phone,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from contacts
where nullif(trim(phone), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  contact_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--email-primary'),
  'contact',
  id,
  'email',
  'Main',
  email,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from contacts
where nullif(trim(email), '') is not null
on conflict (id) do nothing;

insert into crm_contact_methods (
  id,
  owner_kind,
  contact_id,
  kind,
  label,
  value,
  is_primary,
  is_active,
  created_at,
  updated_at
)
select
  concat(id, '--fax-primary'),
  'contact',
  id,
  'fax',
  'Fax',
  fax,
  true,
  is_active,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from contacts
where nullif(trim(fax), '') is not null
on conflict (id) do nothing;
