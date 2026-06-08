create sequence if not exists service_agreement_number_sequence start with 1001;

create table if not exists service_agreements (
  id text primary key,
  agreement_number text not null unique,
  customer_id text not null references customers(id),
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  source_catalog_item_id text references catalog_items(id) on delete set null,
  source_catalog_snapshot jsonb,
  source_estimate_id text references estimates(id) on delete set null,
  source_estimate_line_item_id text references estimate_line_items(id) on delete set null,
  start_date date,
  end_date date,
  renewal_date date,
  billing_cadence text not null default 'none' check (
    billing_cadence in ('none', 'monthly', 'quarterly', 'semiAnnual', 'annual', 'custom')
  ),
  next_billing_date date,
  billing_amount numeric(12, 2) check (billing_amount is null or billing_amount >= 0),
  status_note text,
  activated_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_by_employee_id text references employees(id) on delete set null,
  created_by_name text not null,
  updated_by_employee_id text references employees(id) on delete set null,
  updated_by_name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint service_agreements_source_catalog_snapshot_object
    check (source_catalog_snapshot is null or jsonb_typeof(source_catalog_snapshot) = 'object'),
  constraint service_agreements_date_order
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists service_agreements_customer_idx
  on service_agreements(customer_id);

create index if not exists service_agreements_status_idx
  on service_agreements(status);

create index if not exists service_agreements_renewal_idx
  on service_agreements(renewal_date)
  where renewal_date is not null;

create index if not exists service_agreements_next_billing_idx
  on service_agreements(next_billing_date)
  where next_billing_date is not null;

create table if not exists service_agreement_covered_locations (
  id text primary key,
  agreement_id text not null references service_agreements(id) on delete cascade,
  location_id text not null references locations(id),
  created_at timestamptz not null,
  unique (agreement_id, location_id)
);

create index if not exists service_agreement_covered_locations_location_idx
  on service_agreement_covered_locations(location_id);

create table if not exists service_agreement_covered_equipment (
  id text primary key,
  agreement_id text not null references service_agreements(id) on delete cascade,
  equipment_id text not null references equipment(id),
  created_at timestamptz not null,
  unique (agreement_id, equipment_id)
);

create index if not exists service_agreement_covered_equipment_equipment_idx
  on service_agreement_covered_equipment(equipment_id);

create table if not exists service_agreement_visit_templates (
  id text primary key,
  agreement_id text not null references service_agreements(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'semiAnnual', 'annual', 'custom')),
  interval_months integer check (interval_months is null or interval_months > 0),
  preferred_month integer check (preferred_month is null or preferred_month between 1 and 12),
  preferred_day_of_month integer check (
    preferred_day_of_month is null or preferred_day_of_month between 1 and 31
  ),
  time_window_label text,
  job_type text,
  category text,
  summary text,
  estimated_duration_minutes integer check (
    estimated_duration_minutes is null or estimated_duration_minutes > 0
  ),
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists service_agreement_visit_templates_agreement_idx
  on service_agreement_visit_templates(agreement_id);
