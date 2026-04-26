drop index if exists equipment_history_entries_equipment_id_idx;
drop table if exists equipment_history_entries;

alter table equipment
  drop constraint if exists equipment_system_group_fk;

drop index if exists equipment_system_groups_inventory_name_idx;
drop index if exists equipment_system_groups_location_name_idx;
drop table if exists equipment_system_groups;

update equipment
set serial_number = coalesce(nullif(serial_number, ''), 'UNKNOWN-SERIAL')
where serial_number is null
   or serial_number = '';

alter table equipment
  drop column if exists replaces_equipment_id,
  drop column if exists system_group_id,
  drop column if exists warranty_provider_note,
  drop column if exists warranty_end_date,
  drop column if exists warranty_start_date;

alter table equipment
  alter column serial_number set not null;
