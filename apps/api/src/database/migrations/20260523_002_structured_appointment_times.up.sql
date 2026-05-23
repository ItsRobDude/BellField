alter table appointments
  add column if not exists scheduled_start_time time,
  add column if not exists scheduled_end_time time;

create index if not exists appointments_technician_date_start_idx
  on appointments(technician_id, scheduled_date, scheduled_start_time);
