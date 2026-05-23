drop index if exists appointments_technician_date_start_idx;

alter table appointments
  drop column if exists scheduled_end_time,
  drop column if exists scheduled_start_time;
