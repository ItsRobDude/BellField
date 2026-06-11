# Phase 2 Local Backup/Restore Smoke - 2026-06-11

This records the strongest nondestructive Phase 2 validation run on the available Windows development PC.

It is evidence for the repo-side backup/restore foundation. It is not the scratch-machine restore gate.

## Machine Boundary

Available:

- repo checkout with dev tools
- Docker Postgres container `bellfield-postgres`
- generated `release/` artifact from `pnpm build:release`

Not available on the Windows host:

- `pg_dump` on PATH
- `pg_restore` on PATH
- bundled PostgreSQL binaries under `release/postgres/bin`
- WinSW service registration
- scratch/replacement machine

Because host PostgreSQL client tools were unavailable, this smoke did not run a real worker-produced `pg_dump` backup or a full restore. Those remain the Phase 2 gate.

## What Passed

- `pnpm --filter @bellfield/worker test`
  - worker runner runs fixed-interval jobs
  - worker runner honors an initial startup delay
  - throwing jobs are isolated
  - scheduled backups run immediately when no successful backup exists or the last success is overdue
  - scheduled backups wait only the remaining interval after a recent success
  - backup startup recovery marks orphaned `running` rows failed and removes manifest-less partial backup sets
  - backup service writes a dump/media/manifest through a fake process runner
  - failed backups are recorded and partial sets removed
  - retention deletes old backup sets and marks rows
- `pnpm --filter @bellfield/api test -- system-diagnostics.service.spec.ts support.service.spec.ts`
- `pnpm --filter @bellfield/api test`
- `pnpm --filter @bellfield/office-web test:ui`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm check:architecture`
- `pnpm check:ui-copy`
- `git diff --check`
- `pnpm build:release`
- `pnpm smoke:restore-staging`

Release artifact spot checks passed:

- `release/tools/install/restore-backup.mjs` exists
- `release/apps/api/src/database/migrations/20260611_001_backup_runs.up.sql` exists
- worker test files are not emitted into `release/apps/worker/dist`
- `release/tools/install/write-server-config.mjs` writes the backup env defaults
- `restore-backup.mjs` refuses to run without `--confirm=RESTORE`

Restore-staging smoke passed against scratch temp directories:

- backup media was copied to a staging directory before swap
- current media remained untouched before swap
- staged media replaced the target only after copy succeeded
- previous media root and license file were preserved as rollback paths

Packaged migration smoke passed against an isolated Docker database:

```text
database: bellfield_phase2_smoke_1781142690857
Applied 55 migrations. Migrations are now up to date.
table=backup_runs
migration_count=1
cleanup: dropped isolated database
```

Compiled worker boot smoke passed with backups disabled:

```text
worker_running=true
Worker started.
Worker heartbeat.
```

## Not Proven

- real `pg_dump` execution from the worker on this Windows host
- real `pg_restore` execution from the packaged restore helper
- Windows service stop/start behavior during restore
- restore onto a scratch/replacement machine
- backup/restore from a network or Unraid path
- restore of real media attachments after app usage

Those remain required before claiming the Phase 2 gate.
