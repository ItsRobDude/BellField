create table if not exists customer_document_snapshots (
  id text primary key,
  document_type text not null check (document_type in ('estimate', 'invoice')),
  job_id text not null references jobs(id) on delete cascade,
  estimate_id text references estimates(id) on delete set null,
  invoice_id text references invoices(id) on delete set null,
  source_version integer not null check (source_version > 0),
  filename text not null,
  content_type text not null check (content_type = 'application/pdf'),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size > 0),
  generated_by_employee_id text not null references employees(id),
  generated_by_name text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint customer_document_source_shape check (
    (document_type = 'estimate' and estimate_id is not null and invoice_id is null)
    or (document_type = 'invoice' and invoice_id is not null and estimate_id is null)
  )
);

create index if not exists customer_document_snapshots_job_created_idx
  on customer_document_snapshots(job_id, created_at desc);

create index if not exists customer_document_snapshots_estimate_created_idx
  on customer_document_snapshots(estimate_id, created_at desc)
  where estimate_id is not null;

create table if not exists outbound_messages (
  id text primary key,
  channel text not null check (channel in ('email')),
  provider text not null check (provider in ('resend')),
  status text not null check (status in ('queued', 'sent', 'failed', 'delivered', 'bounced', 'complained')),
  job_id text not null references jobs(id) on delete cascade,
  estimate_id text references estimates(id) on delete set null,
  invoice_id text references invoices(id) on delete set null,
  document_snapshot_id text references customer_document_snapshots(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body_text text not null,
  sent_by_employee_id text not null references employees(id),
  sent_by_name text not null,
  queued_at timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  provider_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_messages_source_shape check (
    (estimate_id is not null and invoice_id is null)
    or (estimate_id is null and invoice_id is not null)
  )
);

create index if not exists outbound_messages_job_created_idx
  on outbound_messages(job_id, created_at desc);

create index if not exists outbound_messages_estimate_created_idx
  on outbound_messages(estimate_id, created_at desc)
  where estimate_id is not null;

create index if not exists outbound_messages_status_idx
  on outbound_messages(status);

create unique index if not exists outbound_messages_provider_message_idx
  on outbound_messages(provider, provider_message_id)
  where provider_message_id is not null;
