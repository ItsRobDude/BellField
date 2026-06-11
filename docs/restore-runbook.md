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
bellfield-backup-YYYYMMDD-HHMMSSZ\
  database.dump
  media\
  manifest.json
```

The database dump is PostgreSQL custom format from `pg_dump --format=custom`.
The `media` directory is a recursive copy of `BELLFIELD_MEDIA_ROOT`.

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
  --backup-set=C:\BellField\data\backups\bellfield-backup-YYYYMMDD-HHMMSSZ `
  --confirm=RESTORE
```

What the helper does:

1. Stops the BellField app services: office-web, worker, API.
2. Leaves PostgreSQL running so the restore tools can connect.
3. Drops and recreates the configured BellField database.
4. Restores `database.dump` with `pg_restore`.
5. Replaces `BELLFIELD_MEDIA_ROOT` with the backup set's `media` directory.
6. Runs packaged migrations.
7. Starts API, worker, and office-web.

For a scratch drill without Windows services, pass `--skip-services=true`.

## After Restore

Check:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Then sign in and verify:

- System diagnostics load
- Backups card can read the restored `backup_runs` history
- recent customer/location/job records are present
- media attachments or customer documents open when expected

## Important Cautions

The restore helper is intentionally destructive and requires `--confirm=RESTORE`.
It replaces the configured BellField database and media root.

Do not run it against a production server unless the operator has selected the backup set and approved the restore.

Do not promise support for a network backup destination until backup creation and restore have both been tested from that destination.
