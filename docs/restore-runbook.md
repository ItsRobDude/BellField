# BellField Backup And Restore Runbook

This runbook is the current Phase 2 restore path for assisted installs.

It is not yet a self-serve disaster-recovery wizard. It is the operator procedure for restoring a BellField server from a backup set produced by the worker.

## Current Boundary

Phase 2 adds:

- scheduled worker backups
- a `backup_runs` history table
- backup freshness on the System surface
- a packaged restore helper under `tools/install/restore-backup.mjs`

Still not claimed:

- scratch-machine restore gate
- customer self-service restore
- arbitrary NAS/cloud backup layouts
- update rollback using automatic pre-update backups

Rerun #13 reached this gate after a full clean Windows Gate 1 pass, then failed
before restore because the documented packaged manual backup CLI could not find
`pg_dump.exe` from the elevated shell used by the runbook. PR #75 fixed that
manual backup path. Rerun #14 proved the fix on the clean Windows PC: the
packaged backup helper produced a fresh backup set with the required shape. The
restore drill then failed because the old restore helper tried to recreate the
database with the runtime `DATABASE_URL` role, which intentionally does not have
cluster-level `CREATEDB`. The repo-side helper now restores through the owned
database/schema path instead, but the scratch-machine restore gate remains open
until a rebuilt artifact proves it end to end. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-14.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-14.md).

## Backup Set Shape

Each backup set is written under `BELLFIELD_BACKUP_ROOT` as:

```text
bellfield-backup-YYYYMMDD-HHMMSSZ-<runid>\
  database.dump
  media\
  license\
    bellfield-license.json
  manifest.json
```

The database dump is PostgreSQL custom format from `pg_dump --format=custom`.
The `media` directory is a recursive copy of `BELLFIELD_MEDIA_ROOT`.
The `license` file is copied from `BELLFIELD_LICENSE_PATH` when configured so licensed restores can start without online activation.

Retention keeps the newest `BELLFIELD_BACKUP_RETENTION_COUNT` successful backup sets. The default is `7`.

## Supported Destination

Default supported destination:

```text
C:\BellField\data\backups
```

A local external drive or network path may be configured with `BELLFIELD_BACKUP_ROOT`, but it should not be treated as supported for a pilot until a dated backup and restore drill has passed from that exact path.

## Verify Backup Health

In office-web, open `System`.

Expected healthy state:

- Backups card shows `Current`
- last successful time is recent
- no backup item appears under `Needs attention`

The default staleness threshold is `36` hours, controlled by `BELLFIELD_BACKUP_STALE_AFTER_HOURS`.

## Restore Procedure

Use an elevated PowerShell session on the server or replacement server.

Inputs:

- the release folder
- `C:\BellField\bellfield-server.env`
- the backup set path
- PostgreSQL binaries available through `BELLFIELD_POSTGRES_BIN` or `release\postgres\bin`

Run:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\restore-backup.mjs `
  --release-root=.\release `
  --install-root=C:\BellField `
  --backup-set=C:\BellField\data\backups\bellfield-backup-YYYYMMDD-HHMMSSZ-<runid> `
  --confirm=RESTORE
```

What the helper does:

1. Verifies PostgreSQL tools are present and the `DATABASE_URL` role owns the configured database before stopping app services.
2. Copies the backup set's `media` directory to a same-parent staging path.
3. Copies `license\bellfield-license.json` to a same-parent staging path when present.
4. Stops the BellField app services: office-web, worker, API.
5. Leaves PostgreSQL running so the restore tools can connect.
6. Resets the owned `public` schema in the configured BellField database.
7. Restores `database.dump` with `pg_restore --single-transaction`.
8. Renames the existing `BELLFIELD_MEDIA_ROOT` to a timestamped rollback directory, then renames the staged media directory into place.
9. Replaces `BELLFIELD_LICENSE_PATH` from the staged license file when present, preserving the previous license file as a timestamped rollback file.
10. Runs packaged migrations.
11. Starts API, worker, and office-web.

Current v1 restore assumes BellField application data lives in the `public`
schema, with media under `BELLFIELD_MEDIA_ROOT` and the optional license at
`BELLFIELD_LICENSE_PATH`. Large objects and non-public application schemas are
not part of the current backup/restore contract; if BellField adds either, the
restore helper and gate-day smoke must be updated before release.

For a scratch drill without Windows services, pass `--skip-services=true`.

If `BELLFIELD_LICENSE_REQUIRED=true`, the helper checks for `license\bellfield-license.json` before stopping services or replacing data. Use a Phase 3 backup set or install a re-issued license before restoring a license-required server.

## After Restore

Check:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Then sign in and verify:

- System diagnostics load
- the System License card shows the expected shop name and update-window end
- Backups card can read the restored `backup_runs` history
- recent customer/location/job records are present
- media attachments or customer documents open when expected

## Important Cautions

The restore helper is intentionally destructive and requires `--confirm=RESTORE`.
It replaces the configured BellField database and media root.

Do not run it against a production server unless the operator has selected the backup set and approved the restore.

Do not promise support for a network backup destination until backup creation and restore have both been tested from that destination.

## Halfway-Failure Recovery

The helper stages media and license files before stopping services or touching the database. If staging fails, the live database, media root, and license file have not been replaced.

If the preflight fails before the database reset begins, the helper attempts to
restart app services. If the database restore fails after the schema reset
begins, app services remain stopped because the database may be partially
restored, but the live media root is still in its original path. Fix the
PostgreSQL/tooling problem and rerun the same restore, or restore the database
manually from the same `database.dump`.

If the media swap fails, the helper attempts to rename the previous media root back into place before it exits. Check the console output for paths ending in:

```text
.restore-stage-YYYYMMDD-HHMMSSZ
.restore-rollback-YYYYMMDD-HHMMSSZ
```

If the target media path is missing but a rollback directory exists, stop the app services and rename the rollback directory back to the configured `BELLFIELD_MEDIA_ROOT`.

If migrations or service startup fail after the media swap, the restored media is already in place and the previous media root/license are preserved as rollback paths printed by the helper. Keep those rollback paths until the operator has confirmed the restored system works, then remove them manually after a fresh backup succeeds.
