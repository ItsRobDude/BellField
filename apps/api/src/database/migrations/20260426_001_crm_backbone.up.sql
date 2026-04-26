alter table customers
  add column if not exists billing_address_line1 text,
  add column if not exists billing_city text,
  add column if not exists billing_state text,
  add column if not exists billing_postal_code text,
  add column if not exists fax text;

update customers customer
set
  billing_address_line1 = coalesce(customer.billing_address_line1, location.address_line1, 'Billing address pending'),
  billing_city = coalesce(customer.billing_city, location.city, 'Unknown'),
  billing_state = coalesce(customer.billing_state, location.state, 'Unknown'),
  billing_postal_code = coalesce(customer.billing_postal_code, location.postal_code, 'Unknown')
from lateral (
  select address_line1, city, state, postal_code
  from locations
  where customer_id = customer.id
  order by created_at asc nulls last, id asc
  limit 1
) location
where customer.billing_address_line1 is null
   or customer.billing_city is null
   or customer.billing_state is null
   or customer.billing_postal_code is null;

update customers
set
  billing_address_line1 = coalesce(billing_address_line1, 'Billing address pending'),
  billing_city = coalesce(billing_city, 'Unknown'),
  billing_state = coalesce(billing_state, 'Unknown'),
  billing_postal_code = coalesce(billing_postal_code, 'Unknown')
where billing_address_line1 is null
   or billing_city is null
   or billing_state is null
   or billing_postal_code is null;

alter table customers
  alter column billing_address_line1 set not null,
  alter column billing_city set not null,
  alter column billing_state set not null,
  alter column billing_postal_code set not null;

alter table contacts
  add column if not exists fax text;

alter table locations
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists fax text,
  add column if not exists is_active boolean not null default true;

update locations location
set
  phone = coalesce(location.phone, contact.phone),
  email = coalesce(location.email, contact.email),
  fax = coalesce(location.fax, contact.fax)
from lateral (
  select
    contacts.phone,
    contacts.email,
    contacts.fax
  from contacts
  where contacts.id = any(location.contact_ids)
  order by contacts.display_name asc
  limit 1
) contact
where location.phone is null
   or location.email is null
   or location.fax is null;

create table if not exists customer_contact_links (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  contact_id text not null references contacts(id) on delete cascade,
  phone_override text,
  email_override text,
  fax_override text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_contact_links_customer_contact_idx
  on customer_contact_links(customer_id, contact_id);

create table if not exists location_contact_links (
  id text primary key,
  location_id text not null references locations(id) on delete cascade,
  contact_id text not null references contacts(id) on delete cascade,
  phone_override text,
  email_override text,
  fax_override text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists location_contact_links_location_contact_idx
  on location_contact_links(location_id, contact_id);

insert into location_contact_links (
  id,
  location_id,
  contact_id,
  tags,
  is_active,
  created_at,
  updated_at
)
select
  concat(location.id, '--', contact_id),
  location.id,
  contact_id,
  coalesce(contacts.tags, '{}'::text[]),
  coalesce(contacts.is_active, true),
  coalesce(location.created_at, now()),
  coalesce(location.updated_at, now())
from locations location
cross join lateral unnest(location.contact_ids) as linked(contact_id)
left join contacts on contacts.id = linked.contact_id
on conflict (id) do nothing;

create table if not exists location_ownership_history (
  id text primary key,
  location_id text not null references locations(id) on delete cascade,
  customer_id text not null references customers(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists location_ownership_history_location_id_idx
  on location_ownership_history(location_id, started_at desc);

insert into location_ownership_history (
  id,
  location_id,
  customer_id,
  started_at,
  ended_at,
  note,
  created_at
)
select
  concat(location.id, '--owner-1'),
  location.id,
  location.customer_id,
  coalesce(location.created_at, now()),
  null,
  location.history_notes[1],
  coalesce(location.created_at, now())
from locations location
where not exists (
  select 1
  from location_ownership_history history
  where history.location_id = location.id
    and history.ended_at is null
);

create index if not exists customers_name_idx on customers(name);
create index if not exists contacts_display_name_idx on contacts(display_name);
create index if not exists locations_name_idx on locations(name);
