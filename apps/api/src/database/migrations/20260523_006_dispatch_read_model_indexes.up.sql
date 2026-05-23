create index if not exists appointments_scheduled_date_start_idx
  on appointments(scheduled_date, scheduled_start_time);
