alter table if exists company_settings
  add column if not exists customer_facing_sender_name text not null default 'BellField Estimates',
  add column if not exists customer_facing_from_email text not null default 'estimates@bellfield.app';

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
