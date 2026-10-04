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
database/schema path instead. At that point the scratch-machine restore gate
remained open until a rebuilt artifact could prove it end to end. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-14.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-14.md).

Rerun #15 closed the scratch-machine gate with packaged backup creation,
owned-schema restore, service restart, login, pre-backup data survival, and
post-backup marker erasure. Rerun #30 re-proved packaged backup and restore on a
fresh Windows 11 Home install using the runner-first path; media/license work,
migrations, all four services, and API health completed after one readiness
retry. The rerun #30 command log did not include a separate post-restore browser
readback of the marker absence, so rerun #15 remains the direct marker-erasure
evidence. See
[gate-day-clean-windows-smoke-2026-07-08-rerun-30.md](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md).

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

New sets include a versioned `recovery` section in `manifest.json`:

- `application` records the source build version, build kind, release date,
  generation time, and source commit. Missing or invalid build manifests are
  recorded as unknown provenance; the worker still preserves the data backup.
- `configuration` records allowlisted nonsecret settings: API/office ports and
  URLs, session/media limits, backup timing/retention, and delivery polling.
  It also records whether relay access was configured. It never contains the
  database URL/password, media-token secret, relay token, server-instance ID,
  or the raw env file. URLs containing credentials, queries, or fragments are
  omitted. The sanitized relay endpoint is reference information only.
- `configuration.status` is `captured` for the packaged manual helper, updater,
  and newly rendered worker services. Direct source/CLI runs, older service
  manifests, or invalid settings produce `partial` metadata; review missing
  settings against the install defaults before use. Re-render and restart
  existing worker services after updating this tooling.

Pre-update backups identify the **installed** release even though the updater
uses the incoming artifact's backup tool. Older backup sets remain usable; they
do not acquire metadata retroactively. Keep the matching signed release ZIP
with the protected off-machine recovery material: version metadata identifies
the software but does not include its binaries or prove migration compatibility.

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

### Destination prerequisites

The restore helper replaces data in an existing, reachable BellField database;
it does not create a server installation, PostgreSQL cluster, database, role,
env file, or Windows services. On an existing server, verify these inputs before
continuing. For a replacement Windows server:

1. Keep the selected backup and any surviving server configuration in a
   separate protected recovery location. Keep the old server stopped during
   cutover. Read `manifest.json` → `recovery.application` and select the matching
   retained release. Legacy/unknown provenance needs retained install/support
   records. A newer release needs a verified migration path; restoring into an
   older schema/release is not supported by this procedure.
2. Follow [Extract Release](./install-runbook.md#extract-release) and
   [Write Server Config](./install-runbook.md#write-server-config) in the install
   runbook. Use the recovery-config command below when the backup has recovery
   metadata. It restores supported settings into a fresh env file, generates a
   new database password, media-token secret, and relay server-instance ID, and
   puts storage beneath the new install root. Review the old LAN addresses,
   backup destination, and any partial settings before proceeding. For legacy
   sets, generate config normally and recover settings from retained records.
   The raw env file and relay credential deliberately remain outside backups.
   Recover the relay token through its protected issuance record or have
   BellField reissue it; keep relay base URL/token blank until cutover is ready.
   Reissue revokes the previous token. Do not copy the old server's instance ID
   or put credentials in evidence logs. See the
   [relay credential lifecycle](./relay-token-design.md#issuance-and-lifecycle).
3. Follow [Configure LAN Access](./install-runbook.md#configure-lan-access) and
   [Provision PostgreSQL](./install-runbook.md#provision-postgresql), including
   packaged migrations. On a fresh data directory, `provision-postgres.mjs`
   creates the login and database from the new `DATABASE_URL` with that login
   as database owner. The helper exits early for an initialized data directory;
   it does not repair existing credentials or ownership. An operator must
   resolve either mismatch before restore, without granting the runtime role
   cluster-level `CREATEDB`.
4. Place the backup's valid same-shop license at the new configured license path
   using [Install License File](./install-runbook.md#install-license-file), then
   [Register Windows Services](./install-runbook.md#register-windows-services).
   If the backup lacks the license, complete the recovery-copy procedure below
   first. Confirm the installer reaches healthy services; do not create a new
   first owner or enter business data in this temporary empty database.
5. Run restore below with PostgreSQL running and the prepared backup selected.
   The restore preflight checks database ownership before stopping the app
   services. After restore, use the owner account from the restored database
   and complete the readbacks below before returning the server to the shop.

This is the assisted replacement-server route. Rerun #30 proves the existing
clean-machine backup/restore path, not a separate total-loss recovery exercise
with all old configuration unavailable.

### Rebuild configuration from a new backup

Run this only on the replacement, before provisioning PostgreSQL or services:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\write-server-config.mjs `
  --install-root=C:\BellField `
  --from-backup=C:\BellField-Recovery\selected-backup
```

The helper refuses an existing output file and rejects `--force` in recovery
mode. It validates the metadata before creating files, ignores original storage
paths, and leaves relay URL/token blank even when the backup says relay access
was configured. It does not restore the database or contact the relay. Complete
the destination prerequisites above, including LAN configuration and licensing.
Database endpoints/tool paths and service-log paths use installation defaults;
configure any replacement-specific overrides before provisioning services.
Existing-server restore continues using its existing env file and identity.

### Restore release checks

Before staging files, contacting PostgreSQL, or stopping services, restore reads
the manifest and reports source/destination build identities. By default their
version, build kind, and source commit must match. These checks use identity,
not version ordering; a higher version is not automatically compatible.

- For a legacy backup, unknown source provenance, or unavailable destination
  provenance, verify the intended release from independent records and add
  `--allow-unknown-release=true` to the restore command.
- For different known release identities, first verify the forward migration
  path on a scratch copy, then add `--allow-release-mismatch=true`. This flag is
  an operator acknowledgement, not a compatibility test or downgrade support.
- Neither flag accepts malformed/unsupported recovery metadata, bypasses the
  license requirement, or substitutes for the destructive-restore confirmation.

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
11. Prints that the database, media, license, and migrations completed.
12. Starts API, worker, and office-web, then polls API `/health` until it
    reports `status: ok`.

Current v1 restore assumes BellField application data lives in the `public`
schema, with media under `BELLFIELD_MEDIA_ROOT` and the optional license at
`BELLFIELD_LICENSE_PATH`. Large objects and non-public application schemas are
not part of the current backup/restore contract; if BellField adds either, the
restore helper and gate-day smoke must be updated before release.

For a scratch drill without Windows services, pass `--skip-services=true`.
Health polling is skipped automatically with `--skip-services=true`; for
operator diagnostics, the helper also accepts `--skip-health=true`,
`--health-url=<url>`, `--health-timeout-ms=<milliseconds>`, and
`--service-timeout-ms=<milliseconds>`.

### Backup missing its license

If `BELLFIELD_LICENSE_REQUIRED=true`, the helper requires
`license\bellfield-license.json` **inside the selected backup set** before
stopping services or replacing data. A license already installed on the server
does not satisfy that check. Prefer a complete licensed backup set when it
contains the data the operator intends to restore.

If the chosen data backup predates license inclusion or its license is missing:

1. Obtain an authentic BellField-issued replacement license for the same shop
   through the [license issuance procedure](./license-design.md#issuance-boundary).
   Do not edit license JSON or disable required-license mode.
2. Copy the entire chosen backup to a new, clearly named recovery directory
   outside the worker's retention-managed backup root. Preserve the original
   backup unchanged. Add the replacement at
   `<recovery-copy>\license\bellfield-license.json`; leave the dump, media, and
   original manifest unchanged. Record the source backup path, license ID, and
   the deliberate addition in a separate recovery note. The helper validates
   manifest structure and release metadata, but does not rewrite or
   cryptographically authenticate the manifest. The note must identify this as
   a prepared recovery copy.
3. Preserve any existing destination license separately, then place the same
   replacement at `BELLFIELD_LICENSE_PATH` and run the packaged config/license
   validator before the destructive restore:

   ```powershell
   .\release\runtime\node\node.exe .\release\tools\install\validate-server-runtime-config.mjs `
     --release-root=.\release `
     --install-root=C:\BellField
   ```

   Require `status: "ok"`. This verifies the signed license using the selected
   release and validates API/worker configuration without restoring data.

4. Run the normal restore command with `--backup-set` pointing at the recovery
   copy. Keep the original backup and recovery note until post-restore checks
   and a fresh complete backup succeed.

## After Restore

Check:

```powershell
for ($i=1; $i -le 12; $i++) {
  try {
    Invoke-RestMethod http://localhost:3001/health
    break
  } catch {
    "attempt $i failed: $($_.Exception.Message)"
    Start-Sleep -Seconds 5
  }
}
```

Rerun #15 proved restore on the clean Windows machine, but the first immediate
post-restore health probe failed before a bounded retry returned `status: ok`.
The restore helper now performs that readiness wait before printing final
completion. If data restore completed but readiness still fails, treat it as a
service-readiness failure: inspect service logs and `/health` first, and do not
rerun the destructive restore just for that readiness result. Keep the manual
probe as recorded evidence, not as the first readiness gate.

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
