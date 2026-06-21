# BellField Server Install Runbook

This runbook is the current Phase 1 install path for a Windows server PC.

It is not yet a self-serve customer installer. It is the assisted install recipe and validation checklist for the repo-side release artifact.

## Current Boundary

Validated on the development machine:

- first-owner setup flow exists without seed accounts
- API health reports `ok` or `degraded` from database and migration readiness
- API production boot refuses pending migrations
- worker runs from compiled `dist`
- office-web builds as a Next standalone app
- release office-web static assets are copied beside the actual standalone
  server root and covered by `pnpm smoke:release-office-web`
- release assembly and Windows service manifest tooling exist
- release assembly includes `@bellfield/contracts/dist` in deployed API deps
- release assembly writes a build manifest that forces license-required mode in
  sold-shaped artifacts, and stamps version + release date for update
  entitlement checks
- release build manifests force the API to run with `NODE_ENV=production`; the
  Windows service renderer emits production mode for API/worker/office and
  refuses bootstrap seed data
- release assembly signs update artifacts with `bellfield-update-manifest.json`
  and `bellfield-update-signature.json`
- release assembly can package operator-provided PostgreSQL 16 binaries and
  WinSW before signing, and `pnpm smoke:release-build -- --require-gate-day-deps=true`
  verifies those dependencies are present in the signed tree
- release assembly now builds API, worker, and office-web runtime dependencies
  into a portable non-junction layout before signing; `pnpm smoke:release-zip`
  extracts the final ZIP with the Windows operator path and validates the
  extracted dependency graph, office-web SSR/static assets, packaged
  PostgreSQL, and migrations
- worker scheduled backup foundation exists: backup run table, configured
  backup directory, `pg_dump` + media backup set creation, retention, and
  System-surface freshness status
- worker backup startup now runs immediately when no successful backup exists
  or the last success is overdue, and waits only the remaining interval after a
  recent success
- packaged restore helper exists; see [restore-runbook.md](./restore-runbook.md)
- packaged restore stages media/license replacement before swapping live paths
- Phase 3 signed-license runtime verification exists: sold-shaped API startup
  requires a valid offline license file, and the System surface shows license
  identity/update-window status
- local Phase 2 validation passed on 2026-06-11 for worker tests, release
  packaging, backup migration smoke, restore-helper refusal behavior, and
  compiled-worker boot; see
  [phase-2-local-backup-restore-smoke-2026-06-11.md](./phase-2-local-backup-restore-smoke-2026-06-11.md)
- local Phase 3 validation passed on 2026-06-11 for license verifier tests,
  issuance tooling smoke, release packaging, System/support/UI visibility,
  worker license backup inclusion, and restore-helper missing-license refusal;
  see [phase-3-local-license-smoke-2026-06-11.md](./phase-3-local-license-smoke-2026-06-11.md)
- local Phase 4 validation passed on 2026-06-11 for release stamping, signed
  artifact verification, update-window refusal, scratch updater swap, and
  packaged updater contents; see
  [phase-4-local-updater-smoke-2026-06-11.md](./phase-4-local-updater-smoke-2026-06-11.md)
- local compiled-release smoke passed on 2026-06-11: release API, worker,
  office-web standalone, release-packaged migrations, first-owner setup, health,
  and a scheduled-job creation path all ran against an isolated temporary
  database; see [phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md)
- first clean Windows gate-day attempt ran on 2026-06-20 and failed before
  migrations because the signed artifacts packaged `release\postgres\bin` but
  not PostgreSQL `lib`/`share` runtime files required by the bundled tools; see
  [gate-day-clean-windows-smoke-2026-06-20.md](./gate-day-clean-windows-smoke-2026-06-20.md)
- second clean Windows gate-day attempt ran on 2026-06-20 and got past
  PostgreSQL provisioning with the full runtime/app-local VC++ bundle, then
  failed during migrations because the extracted ZIP could not resolve the API
  package dependency `pg`; see
  [gate-day-clean-windows-smoke-2026-06-20-rerun-2.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-2.md)
- third clean Windows gate-day attempt ran on 2026-06-20 and proved the
  post-extraction dependency packaging fix on the scratch machine: the active
  ZIP extracted, packaged PostgreSQL provisioning completed, packaged
  migrations applied, and WinSW services registered. It then failed when
  `bellfield-postgres` started as `LocalSystem`; PostgreSQL refused to run
  under an administrative account. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-3.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-3.md)
- fourth clean Windows gate-day attempt ran on 2026-06-20 and proved the
  repaired USB docs, artifact hashes, extraction, server config, packaged
  PostgreSQL provisioning, migrations, license placement, service manifest
  rendering, and the checked env/PostgreSQL ACL readbacks. It still failed at
  service startup because Windows SCM reported `bellfield-postgres` as
  `LocalSystem` even though the XML contained
  `<serviceaccount><username>NT SERVICE\bellfield-postgres</username>`.
  The repo-side follow-up now enforces and asserts the actual SCM service
  account, but clean-machine proof is still pending. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-4.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-4.md)
- release-build smoke now functionally validates bundled PostgreSQL by running
  packaged `initdb`, `pg_ctl`, `postgres`, and `psql` against a temporary data
  directory when gate-day dependencies are included, and checks the app-local
  VC++ runtime DLLs required by the Windows PostgreSQL bundle

Not yet validated in this repo:

- successful clean Windows machine install with no developer tooling
- successful Windows-service startup of bundled PostgreSQL under a
  non-administrative service identity
- reboot/service recovery proof
- real Windows ACL readback for the final service-identity/data-directory
  model
- second office desktop and Android field-device proof
- scratch-machine backup/restore drill
- real installed v(N) to v(N+1) update with Windows services, real pre-update
  `pg_dump`, health check, and reboot/service recovery proof

## Build The Release Folder

From the repo root:

```powershell
pnpm build:release
```

For gate-day or sold-shaped Windows artifacts, include the runtime
dependencies before the update manifest is signed:

```powershell
pnpm build:release `
  --version=<version> `
  --release-date=<YYYY-MM-DD> `
  --postgres-root=<path-to-PG16-x64-root> `
  --vc-redist-root=<path-to-VC-redist-x64-root> `
  --winsw-exe=<path-to-approved-WinSW-x64.exe>
pnpm smoke:service-manifests
pnpm smoke:release-build -- --require-gate-day-deps=true
pnpm package:release-zip -- --release-root=release --output=<artifact.zip>
pnpm smoke:release-zip -- --zip=<artifact.zip> --require-gate-day-deps=true
```

Do not add PostgreSQL, WinSW, or any other release file after `build:release`
finishes. The signed update manifest covers the release file list and hashes;
post-sign edits make the artifact fail update verification.

Do not package gate-day artifacts with an ad hoc ZIP command. Use
`pnpm package:release-zip` and then `pnpm smoke:release-zip` so the artifact is
validated after ordinary Windows extraction, including API/worker dependency
resolution and office-web startup from the extracted tree.

The script creates `release/` with:

- `runtime/node/node.exe`
- compiled API and worker packages
- the office-web standalone server
- production `node_modules` for API, worker, and the office-web standalone
  server root in a ZIP-portable layout with no symlinks, junctions, or reparse
  points
- API migration scripts and SQL files
- `bellfield-server.env.example`
- install helper scripts under `tools/install`
- update verifier helpers under `tools/update`
- signed update manifest files
- the complete PostgreSQL runtime tree under `postgres` (`bin`, `lib`, and
  `share`), app-local VC++ runtime DLLs in `postgres/bin`, and
  `tools/winsw/WinSW-x64.exe` when the gate-day dependency inputs are provided

`release/` is a generated local artifact and is intentionally not committed.

## Extract Release

For the current assisted Windows gate path, extract the active release ZIP into
the install root with a Windows built-in command. For example, from an ordinary
PowerShell session:

```powershell
New-Item -ItemType Directory -Path C:\BellField -Force | Out-Null
& "$env:SystemRoot\System32\tar.exe" -xf "<path-to-active-bellfield-zip>" -C "C:\BellField"
```

The expected result is `C:\BellField\release`. Do not copy files into the
extracted release after extraction; the signed manifest covers the release file
list and hashes.

## Write Server Config

On the server, choose a fixed install root such as `C:\BellField`.

```powershell
.\release\runtime\node\node.exe .\release\tools\install\write-server-config.mjs --install-root=C:\BellField
```

This writes `C:\BellField\bellfield-server.env`, creates local data directories, and generates secrets. Do not commit or share that file.

License defaults written by the config helper:

- `BELLFIELD_LICENSE_REQUIRED=true`
- `BELLFIELD_LICENSE_PATH=C:\BellField\data\license\bellfield-license.json`

Development/source runs use `BELLFIELD_LICENSE_REQUIRED=false`; customer-shaped server configs require the license file.
Release artifacts also include `bellfield-build-manifest.json` with `licenseRequired=true`, so the API still requires a license even if the env flag is edited to false.
The same release manifest also refuses API startup unless `NODE_ENV=production`.
The service-manifest renderer writes `NODE_ENV=production` for API, worker, and
office-web services, and refuses `BOOTSTRAP_SEED_DATA=true`.

Backup defaults written by the config helper:

- `BELLFIELD_BACKUP_ROOT=C:\BellField\data\backups`
- `BELLFIELD_BACKUP_INTERVAL_MINUTES=1440`
- `BELLFIELD_BACKUP_RETENTION_COUNT=7`
- `BELLFIELD_BACKUP_STALE_AFTER_HOURS=36`

Use a local/server-owned backup directory first. A network path is allowed only after a dated backup and restore drill from that exact path.

## Provision PostgreSQL

Phase 1 expects user-space PostgreSQL 16 binaries to exist at one of:

- `release\postgres\bin`
- the path in `BELLFIELD_POSTGRES_BIN`
- the path passed with `--postgres-bin`

Initialize the data directory and create the app role/database from `DATABASE_URL`:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\provision-postgres.mjs --install-root=C:\BellField
```

If the data directory is already initialized, the helper exits without wiping it.
On a fresh data directory, the helper starts a temporary local PostgreSQL server, creates or updates the app login role with the generated password from `DATABASE_URL`, creates the configured database when missing, changes host authentication from `trust` to `scram-sha-256`, then stops the temporary server.

For the current assisted path, start PostgreSQL temporarily, run migrations, then stop it before registering services:

```powershell
$postgresData = "C:\BellField\data\postgres"
New-Item -ItemType Directory -Path "C:\BellField\data\logs" -Force | Out-Null
.\release\postgres\bin\pg_ctl.exe -D $postgresData -l "C:\BellField\data\logs\manual-postgres-start.log" -o "-h 127.0.0.1 -p 5432" -w start
$env:DATABASE_URL = "<value from C:\BellField\bellfield-server.env>"
.\release\runtime\node\node.exe .\release\apps\api\scripts\migrations\up.mjs
.\release\postgres\bin\pg_ctl.exe -D $postgresData -m fast -w stop
```

For evidence capture, avoid wrapping `pg_ctl start` in a PowerShell pipeline.
Rerun #4 showed that background PostgreSQL can inherit the captured stream and
keep the command open until the wrapper times out. Use `pg_ctl -l <logfile>`
and read the log separately if needed.

## Install License File

Before starting the API service for a customer-shaped install, place the BellField-issued license file at the configured path:

```text
C:\BellField\data\license\bellfield-license.json
```

The API verifies this file offline. It refuses to start when `BELLFIELD_LICENSE_REQUIRED=true` and the file is missing, malformed, or signed by the wrong key. It does not refuse startup because the update window has expired.

License issuance is BellField-side only:

```powershell
node tools\license\generate-keypair.mjs --output-dir=<private-bellfield-key-dir>
node tools\license\issue-license.mjs --kind=paid --private-key=<private-key.pem> --license-id=<id> --shop-name="<Shop Name>" --update-window-end=YYYY-MM-DD --output=<license-file-path>
```

`--kind=paid` is the default for new v2 licenses; pass it anyway in runbooks so
operator intent is visible. `--kind=trial` additionally requires
`--operation-end=YYYY-MM-DD`; `--kind=dataOnly` requires
`--terminated-license-id=<id>` and `--termination-reason=<reason>`.

Do not copy private signing keys into the release folder or a customer machine.

## Register Windows Services

Render WinSW manifests:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\render-windows-services.mjs --install-root=C:\BellField --release-root=.\release
```

Place the approved WinSW x64 binary at:

```text
release\tools\winsw\WinSW-x64.exe
```

Install services from an elevated PowerShell session. On a clean Windows
machine, PowerShell may refuse unsigned `.ps1` files by default. For the
current assisted runbook, use a process-scoped execution-policy bypass rather
than changing machine policy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass
.\release\tools\install\install-windows-services.ps1 -ReleaseRoot .\release
```

The install script copies the WinSW executable beside each XML manifest,
stops/uninstalls any existing BellField services so the step is repairable,
registers the services, configures `bellfield-postgres` through Windows SCM as
`NT SERVICE\bellfield-postgres`, reads back `Win32_Service.StartName`, enables
the unrestricted service SID, then applies ACLs before startup. If SCM does not
read back the expected PostgreSQL service identity, the install fails before
`Start-Service`.

The PostgreSQL WinSW XML deliberately does not contain `<serviceaccount>`.
Run #4 proved XML account shape is insufficient: the XML contained
`NT SERVICE\bellfield-postgres`, but the installed Windows service still
reported `LocalSystem`. Treat SCM `StartName` readback and service startup as
the proof, not manifest inspection.

Before rebuilding gate-day artifacts to close the service-identity blocker, run
the elevated diagnostic with the same WinSW binary and save the JSON result:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\release\tools\install\diagnose-windows-service-account.ps1 -WinSwExe .\release\tools\winsw\WinSW-x64.exe -KeepArtifacts
```

On a cleaned scratch machine the default diagnostic service id is
`bellfield-postgres`, so it proves the exact virtual account name the installer
uses. If a machine already has a BellField service, clean it first or pass a
temporary `-ServiceId`; the script refuses to modify an existing service.

Intended service/ACL model for the next fixed artifact:

- `bellfield-postgres` runs as `NT SERVICE\bellfield-postgres`.
- `C:\BellField\bellfield-server.env` remains restricted to Administrators and
  LocalSystem while app services still run as LocalSystem.
- `C:\BellField\release\services` is restricted to Administrators and
  LocalSystem, with only narrow read/traverse access for
  `NT SERVICE\bellfield-postgres`.
- `C:\BellField\release\services\bellfield-postgres.xml` and
  `bellfield-postgres.exe` grant only the PostgreSQL virtual account the access
  it needs to start.
- `C:\BellField\release\postgres`, `C:\BellField\data\postgres`, and
  `C:\BellField\data\logs\services\bellfield-postgres` grant the PostgreSQL
  virtual account read/execute or write access as appropriate.
- WinSW service logs are written under
  `C:\BellField\data\logs\services\<service-id>`, not beside the XML files.

Service order:

1. `bellfield-postgres`
2. `bellfield-api`
3. `bellfield-worker`
4. `bellfield-office-web`

## First Owner Setup

With a fresh migrated database and no active employees, the API logs a one-time setup token:

```text
BellField first-owner setup token: ...
```

Open the office web app, paste that token into the setup form, and create the first owner account.

Rules:

- the setup token is never shown by the UI
- the setup endpoint is rate-limited
- the token is single-use
- after any active employee exists, `POST /identity/setup/first-owner` returns 404

## Health Check

Use the unauthenticated health endpoint:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Expected shape:

```json
{ "status": "ok", "timestamp": "2026-06-11T00:00:00.000Z" }
```

`degraded` means the API could not confirm database reachability, bundled migration readability, or zero pending migrations. Detailed diagnostics remain behind the authenticated System surface.

## Backup And Restore

The worker creates scheduled backup sets under `BELLFIELD_BACKUP_ROOT`.
Each set includes:

- `database.dump` from PostgreSQL custom-format `pg_dump`
- a recursive copy of `BELLFIELD_MEDIA_ROOT`
- `license\bellfield-license.json` when `BELLFIELD_LICENSE_PATH` is configured
- `manifest.json`

The System surface shows the latest successful backup and warns when it is stale.

Restore is assisted and destructive. Use:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\restore-backup.mjs --release-root=.\release --install-root=C:\BellField --backup-set=<backup-set-path> --confirm=RESTORE
```

See [restore-runbook.md](./restore-runbook.md) before running a restore.

## Download A Release

Sold installs fetch release artifacts from the BellField relay using the
shop's relay token. Downloads verify token identity only — they never affect
the shop's delivery activation — and refuse releases dated past the license's
update window.

```powershell
# List releases and entitlement:
Invoke-RestMethod https://relay.bellfield.app/v1/releases -Headers @{ Authorization = "Bearer <relay token>" }
# Download an entitled release:
Invoke-WebRequest https://relay.bellfield.app/v1/releases/<releaseId>/download -Headers @{ Authorization = "Bearer <relay token>" } -OutFile bellfield-release.zip
```

BellField-side publishing: copy the zip into the relay host's `artifacts/`
volume, then `relay-admin publish-release --file=<name> --version=<v>
--release-date=YYYY-MM-DD`; record each shop's window with
`relay-admin set-update-window`.

## Update Existing Install

Run the updater from an extracted new release artifact, not from the installed
current release root.

Trust boundary: the artifact signature proves the integrity of a release that
came from BellField — it is not a defense against running a hostile updater,
because the updater itself ships inside the artifact. Only run updates
downloaded from the BellField-provided channel.

Example from the new release artifact directory:

```powershell
.\runtime\node\node.exe .\tools\install\update-bellfield.mjs `
  --install-root=C:\BellField `
  --current-release-root=C:\BellField\release `
  --confirm=UPDATE
```

The updater:

1. Verifies `bellfield-update-manifest.json` and `bellfield-update-signature.json`.
2. Verifies the installed license file from `BELLFIELD_LICENSE_PATH`.
3. Refuses the update when the artifact `releaseDate` is after the license `updateWindowEnd`.
4. Stage-copies the new release beside the current release root.
5. Runs a hard-fail pre-update backup through the packaged worker manual backup CLI.
6. Stops app services.
7. Swaps the staged release into `--current-release-root`, preserving the prior release as a timestamped rollback directory.
8. Runs packaged migrations.
9. Restarts services and waits for `/health`.

For scratch validation only, the updater supports `--skip-services=true`,
`--skip-health=true`, and `--skip-backup=true`. Do not use those skips for a
customer update.

If an update fails after the release swap, preserve the printed rollback release
directory and restore the pre-update backup using [restore-runbook.md](./restore-runbook.md).

## Uninstall / Repair Notes

For now, assisted uninstall is manual:

1. Stop BellField services.
2. Uninstall WinSW services in reverse order.
3. Preserve `C:\BellField\bellfield-server.env`, PostgreSQL data, media, license, and backups unless the customer explicitly approves deletion.
4. Remove generated service executables/manifests and release files.

Repair should rerun config rendering and service installation without deleting data directories.
