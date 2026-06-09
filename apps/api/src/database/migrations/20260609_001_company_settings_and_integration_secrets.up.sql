create table if not exists company_settings (
  id text primary key check (id = 'default'),
  company_name text not null,
  customer_facing_sender_name text not null,
  customer_facing_from_email text not null,
  reply_to_email text,
  estimate_email_subject text not null,
  estimate_email_body text not null,
  updated_by_employee_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration_secrets (
  id text primary key,
  provider text not null check (provider in ('resend')),
  purpose text not null check (purpose in ('email')),
  encrypted_value text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  last_configured_by_employee_id text,
  last_configured_by_name text,
  last_configured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, purpose)
);
