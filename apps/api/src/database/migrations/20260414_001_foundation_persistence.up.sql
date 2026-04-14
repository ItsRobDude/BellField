create sequence if not exists job_number_sequence start with 1003;

create table if not exists employees (
  id text primary key,
  email text not null unique,
  display_name text not null,
  role_id text not null,
  is_active boolean not null default true,
  password text not null,
  granted_permissions text[] not null default '{}',
  revoked_permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  employee_id text not null references employees(id) on delete cascade,
  surface text not null,
  device_label text,
  issued_at timestamptz not null
);

create table if not exists customers (
  id text primary key,
  name text not null,
  account_type text not null,
  is_active boolean not null default true,
  phone text,
  email text,
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id text primary key,
  display_name text not null,
  phone text,
  email text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists locations (
  id text primary key,
  name text not null,
  customer_id text not null references customers(id),
  address_line1 text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  contact_ids text[] not null default '{}',
  alternate_bill_to_customer_ids text[] not null default '{}',
  history_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists equipment (
  id text primary key,
  location_id text references locations(id),
  inventory_location_label text,
  equipment_type text not null,
  brand text not null,
  model text not null,
  serial_number text not null,
  filter_sizes text[] not null default '{}',
  equipment_location_description text,
  install_date date,
  status text not null,
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists jobs (
  id text primary key,
  job_number text not null unique,
  location_id text not null references locations(id),
  bill_to_customer_id text not null references customers(id),
  job_type text not null,
  category text not null,
  origin text not null,
  summary text not null,
  status text not null,
  work_order_number text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists appointments (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  scheduled_date date,
  time_window_label text,
  technician_id text references employees(id),
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists job_timeline_entries (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  occurred_at timestamptz not null,
  actor_name text not null,
  kind text not null,
  message text not null
);

create index if not exists sessions_employee_id_idx on sessions(employee_id);
create index if not exists equipment_location_id_idx on equipment(location_id);
create index if not exists jobs_location_id_idx on jobs(location_id);
create index if not exists appointments_job_id_idx on appointments(job_id);
create index if not exists appointments_technician_date_idx on appointments(technician_id, scheduled_date);
create index if not exists job_timeline_entries_job_id_idx on job_timeline_entries(job_id);
