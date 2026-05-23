create table if not exists media_attachments (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  appointment_id text references appointments(id),
  kind text not null check (kind in ('image', 'video', 'document')),
  content_type text not null check (length(content_type) between 1 and 200),
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (length(sha256) = 64),
  original_filename text not null check (length(trim(original_filename)) > 0 and length(original_filename) <= 255),
  caption text check (caption is null or length(caption) <= 500),
  captured_by_employee_id text not null references employees(id),
  captured_by_name text not null,
  captured_at timestamptz not null,
  storage_path text,
  uploaded_at timestamptz,
  is_void boolean not null default false,
  void_reason text check (void_reason is null or length(void_reason) <= 500),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists media_attachments_job_captured_idx on media_attachments(job_id, captured_at);
create index if not exists media_attachments_appointment_idx on media_attachments(appointment_id) where appointment_id is not null;
create unique index if not exists media_attachments_job_sha256_idx on media_attachments(job_id, sha256);
