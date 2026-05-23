create table if not exists register_entries (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  appointment_id text references appointments(id),
  kind text not null check (kind in ('labor', 'serviceItem', 'part', 'membership', 'other')),
  description text not null check (length(trim(description)) > 0 and length(description) <= 500),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_of_measure text check (unit_of_measure is null or length(unit_of_measure) <= 40),
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  part_number text check (part_number is null or length(part_number) <= 120),
  inventory_source_label text check (inventory_source_label is null or length(inventory_source_label) <= 120),
  captured_by_employee_id text not null references employees(id),
  captured_by_name text not null,
  captured_at timestamptz not null,
  is_void boolean not null default false,
  void_reason text check (void_reason is null or length(void_reason) <= 500),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists register_entries_job_captured_idx on register_entries(job_id, captured_at);
create index if not exists register_entries_appointment_idx on register_entries(appointment_id) where appointment_id is not null;
