-- Down: 20260601_029_register_client_operation_id

drop index if exists register_entries_client_operation_id_key;

alter table register_entries
  drop column if exists client_operation_id;
