alter table equipment
  alter column serial_number drop not null;

alter table equipment
  add column if not exists warranty_start_date date,
  add column if not exists warranty_end_date date,
  add column if not exists warranty_provider_note text,
  add column if not exists system_group_id text,
  add column if not exists replaces_equipment_id text references equipment(id) on delete set null;

create table if not exists equipment_system_groups (
  id text primary key,
  name text not null,
  location_id text references locations(id) on delete cascade,
  inventory_location_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_system_groups_placement_check check (
    (location_id is not null and inventory_location_label is null)
    or (location_id is null and inventory_location_label is not null)
  )
);

create unique index if not exists equipment_system_groups_location_name_idx
  on equipment_system_groups(location_id, name)
  where location_id is not null;

create unique index if not exists equipment_system_groups_inventory_name_idx
  on equipment_system_groups(inventory_location_label, name)
  where inventory_location_label is not null;

alter table equipment
  add constraint equipment_system_group_fk
  foreign key (system_group_id) references equipment_system_groups(id) on delete set null;

create table if not exists equipment_history_entries (
  id text primary key,
  equipment_id text not null references equipment(id) on delete cascade,
  occurred_at timestamptz not null,
  actor_name text not null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists equipment_history_entries_equipment_id_idx
  on equipment_history_entries(equipment_id, occurred_at desc);

insert into equipment_history_entries (
  id,
  equipment_id,
  occurred_at,
  actor_name,
  kind,
  message,
  created_at
)
select
  concat(equipment.id, '--history-created'),
  equipment.id,
  equipment.created_at,
  'BellField bootstrap',
  'created',
  'Equipment record created.',
  equipment.created_at
from equipment
where not exists (
  select 1
  from equipment_history_entries history
  where history.id = concat(equipment.id, '--history-created')
);
