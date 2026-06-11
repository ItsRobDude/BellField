create table backup_runs (
  id uuid primary key,
  run_kind text not null check (run_kind in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  backup_set_path text,
  database_dump_path text,
  media_backup_path text,
  manifest_path text,
  backup_set_deleted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  check (
    (status = 'running' and completed_at is null)
    or (status in ('succeeded', 'failed') and completed_at is not null)
  ),
  check (
    status <> 'succeeded'
    or (
      backup_set_path is not null
      and database_dump_path is not null
      and media_backup_path is not null
      and manifest_path is not null
    )
  )
);

create index backup_runs_started_at_idx on backup_runs (started_at desc);
create index backup_runs_latest_success_idx
  on backup_runs (completed_at desc)
  where status = 'succeeded' and backup_set_deleted_at is null;
