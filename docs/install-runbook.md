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
- release assembly and Windows service manifest tooling exist
- local compiled-release smoke passed on 2026-06-11: release API, worker,
  office-web standalone, release-packaged migrations, first-owner setup, health,
  and a scheduled-job creation path all ran against an isolated temporary
  database; see [phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md)

Not yet validated in this repo:

- clean Windows machine with no developer tooling
- bundled PostgreSQL binaries placed in `release/postgres/bin`
- WinSW binary placed in `release/tools/winsw/WinSW-x64.exe`
- reboot/service recovery proof
- second office desktop and Android field-device proof
- backup/restore/update gates

## Build The Release Folder

From the repo root:

```powershell
pnpm build:release
```

The script creates `release/` with:

- `runtime/node/node.exe`
- compiled API and worker packages
- the office-web standalone server
- API migration scripts and SQL files
- `bellfield-server.env.example`
- install helper scripts under `tools/install`

`release/` is a generated local artifact and is intentionally not committed.

## Write Server Config

On the server, choose a fixed install root such as `C:\BellField`.

```powershell
.\release\runtime\node\node.exe .\release\tools\install\write-server-config.mjs --install-root=C:\BellField
```

This writes `C:\BellField\bellfield-server.env`, creates local data directories, and generates secrets. Do not commit or share that file.

## Provision PostgreSQL

Phase 1 expects user-space PostgreSQL 16 binaries to exist at one of:

- `release\postgres\bin`
- the path in `BELLFIELD_POSTGRES_BIN`
- the path passed with `--postgres-bin`

Initialize the data directory:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\provision-postgres.mjs --install-root=C:\BellField
```

If the data directory is already initialized, the helper exits without wiping it.

After PostgreSQL is running, create the `bellfield` database/user from `bellfield-server.env`, then run migrations:

```powershell
$env:DATABASE_URL = "<value from C:\BellField\bellfield-server.env>"
.\release\runtime\node\node.exe .\release\apps\api\scripts\migrations\up.mjs
```

## Register Windows Services

Render WinSW manifests:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\render-windows-services.mjs --install-root=C:\BellField --release-root=.\release
```

Place the approved WinSW x64 binary at:

```text
release\tools\winsw\WinSW-x64.exe
```

Install services from an elevated PowerShell session:

```powershell
.\release\tools\install\install-windows-services.ps1 -ReleaseRoot .\release
```

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

## Uninstall / Repair Notes

For now, assisted uninstall is manual:

1. Stop BellField services.
2. Uninstall WinSW services in reverse order.
3. Preserve `C:\BellField\bellfield-server.env`, PostgreSQL data, media, license, and backups unless the customer explicitly approves deletion.
4. Remove generated service executables/manifests and release files.

Repair should rerun config rendering and service installation without deleting data directories.
