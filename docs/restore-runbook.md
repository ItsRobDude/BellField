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

1. Copies the backup set's `media` directory to a same-parent staging path.
2. Copies `license\bellfield-license.json` to a same-parent staging path when present.
3. Stops the BellField app services: office-web, worker, API.
4. Leaves PostgreSQL running so the restore tools can connect.
5. Drops and recreates the configured BellField database.
6. Restores `database.dump` with `pg_restore`.
7. Renames the existing `BELLFIELD_MEDIA_ROOT` to a timestamped rollback directory, then renames the staged media directory into place.
8. Replaces `BELLFIELD_LICENSE_PATH` from the staged license file when present, preserving the previous license file as a timestamped rollback file.
9. Runs packaged migrations.
10. Starts API, worker, and office-web.

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

If the database restore fails before the media swap, the app services may be stopped and the database may be dropped or partially restored, but the live media root is still in its original path. Fix the PostgreSQL/tooling problem and rerun the same restore, or restore the database manually from the same `database.dump`.

If the media swap fails, the helper attempts to rename the previous media root back into place before it exits. Check the console output for paths ending in:

```text
.restore-stage-YYYYMMDD-HHMMSSZ
.restore-rollback-YYYYMMDD-HHMMSSZ
```

If the target media path is missing but a rollback directory exists, stop the app services and rename the rollback directory back to the configured `BELLFIELD_MEDIA_ROOT`.

If migrations or service startup fail after the media swap, the restored media is already in place and the previous media root/license are preserved as rollback paths printed by the helper. Keep those rollback paths until the operator has confirmed the restored system works, then remove them manually after a fresh backup succeeds.
