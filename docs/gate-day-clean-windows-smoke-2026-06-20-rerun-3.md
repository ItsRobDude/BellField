# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 3

This records the third fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-3-2026-06-20.md`,
`evidence/command-log-rerun-3.txt`, and the three elevated PowerShell
transcripts on the USB. This repo doc is the sanitized, durable summary.

Status: **failed at Gate 1 service startup**.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260620.5.zip`
  - version: `0.0.1-gateday.20260620.5`
  - release date: `2026-06-20`
  - source commit: `cfdf586`
  - SHA256:
    `1e1d0c1cb0cd57ba8cbc3b4f4c2443a7a2c6c80089648575f7717d0cca98aef4`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260620.6.zip`
  - version: `0.0.1-gateday.20260620.6`
  - release date: `2026-06-20`
  - source commit: `cfdf586`
  - SHA256:
    `11d18f4a72d8ea2a40985fa8f947337fa5ad6f99f94d70d38fe34082702fcd6f`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Scratch Machine Baseline

- Machine: `DESKTOP-R51IMEA`
- OS: Microsoft Windows 11 Pro `10.0.26200`, build `26200`, 64-bit
- Operator state: Codex was not elevated; human approved UAC prompts when
  required
- Network: Wi-Fi `192.168.50.182/24`
- USB drive letter: `E:`
- `C:\BellField` was absent before the run
- No disallowed developer tooling was found on `PATH` for:
  `node`, `git`, `pnpm`, `npm`, `yarn`, `bun`, `corepack`, `psql`, `docker`,
  `code`, `pg_ctl`, `initdb`, `pg_restore`, or `pg_dump`

## What Passed

Run #3 proved that the earlier artifact packaging blockers were fixed:

- Active artifact hashes matched `SHA256SUMS.txt`.
- Artifact `.5` extracted cleanly to `C:\BellField`.
- `release\bellfield-build-manifest.json` reported
  `0.0.1-gateday.20260620.5` and `licenseRequired=true`.
- Packaged runtime files existed:
  - `release\runtime\node\node.exe`
  - `release\postgres\bin\initdb.exe`
  - `release\postgres\lib`
  - `release\postgres\share\postgres.bki`
  - `release\postgres\bin\vcruntime140.dll`
  - `release\postgres\bin\vcruntime140_1.dll`
  - `release\postgres\bin\msvcp140.dll`
  - `release\tools\winsw\WinSW-x64.exe`
- `write-server-config.mjs` generated `C:\BellField\bellfield-server.env`
  and local data directories without printing secrets.
- `BELLFIELD_RELAY_SERVER_INSTANCE_ID` was generated locally by
  `write-server-config.mjs`; the USB relay config was not applied during this
  failed run.
- `provision-postgres.mjs` initialized
  `C:\BellField\data\postgres`, created or updated the app role/database, and
  changed TCP host authentication to `scram-sha-256`.
- Packaged migrations ran from the extracted release tree and applied
  74 migrations after the operator split the temporary start/migrate/stop
  sequence.
- The valid license was copied to
  `C:\BellField\data\license\bellfield-license.json`.
- `render-windows-services.mjs` produced four WinSW service manifests.
- After a process-scoped PowerShell execution-policy bypass, the packaged
  service installer registered all four Windows services:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- ACL readback showed `C:\BellField\bellfield-server.env` and
  `C:\BellField\release\services` restricted to `SYSTEM` and
  `Administrators`; non-elevated Codex could not read the service manifest
  directory after install, which matches that hardening.

## What Failed

The service installer registered the services, then failed while starting
`bellfield-postgres`.

Readback from elevated inspection:

```text
Name                 State   StartMode StartName   PathName
----                 -----   --------- ---------   --------
bellfield-postgres   Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-postgres.exe"
bellfield-api        Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-api.exe"
bellfield-worker     Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-worker.exe"
bellfield-office-web Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-office-web.exe"
```

`bellfield-postgres.err.log` repeated:

```text
Execution of PostgreSQL by a user with administrative permissions is not
permitted.
The server must be started under an unprivileged user ID to prevent
possible system security compromises.
```

The generated PostgreSQL service manifest runs the packaged
`postgres.exe` directly:

```xml
<executable>C:\BellField\release\postgres\bin\postgres.exe</executable>
<arguments>-D &quot;C:\BellField\data\postgres&quot;</arguments>
```

Because the service XML does not specify a dedicated service account, WinSW
registers the service under `LocalSystem`. PostgreSQL on Windows refuses to
run under an administrative account, so the database service exits immediately.
The API, worker, and office-web services remain stopped because they depend on
the database service.

## Deviations

| Category       | Severity | Step                        | What happened                                                                                                                                            | Follow-up                                                                                                                                                          |
| -------------- | -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| runbook-gap    | minor    | Service install             | Clean Windows refused the packaged `.ps1` with "running scripts is disabled on this system." The operator used a human-approved process-scoped bypass.   | Document the process-scoped `-ExecutionPolicy Bypass` invocation or sign the install script before self-serve claims.                                              |
| operator-error | minor    | Temporary migration command | The combined start/migrate/stop command timed out after roughly 184 seconds and left temporary PostgreSQL running. A split rerun applied all migrations. | For future smokes, split start, migration, and stop commands or use a longer operator timeout. This was not the product blocker.                                   |
| install-bug    | blocking | PostgreSQL service startup  | `bellfield-postgres` was registered as `LocalSystem`, and PostgreSQL refused to run with administrative permissions. Downstream services never started.  | Create/use a dedicated unprivileged Windows account for PostgreSQL and apply the correct data/log/service ACLs, or adopt a supported service wrapper that does so. |

## Root Cause

This is no longer a release packaging bug. Artifact `.5` contained the
PostgreSQL runtime, VC++ runtime DLLs, portable Node dependencies, and WinSW.

The blocker is the Windows service account model. Current code in
`tools/install/render-windows-services.mjs` emits the PostgreSQL service XML
without an account identity. Current
`tools/install/install-windows-services.ps1` installs that XML as-is. WinSW's
default service account is `LocalSystem`, and PostgreSQL refuses to run as an
administrative user.

## Recommended Fix

The next focused fix should be Windows service identity and ACL handling:

1. Render PostgreSQL's WinSW XML with the passwordless virtual account
   `NT SERVICE\bellfield-postgres`, not a generated local account password.
2. Put WinSW logs under
   `C:\BellField\data\logs\services\<service-id>` so the service wrappers do
   not need to write beside secret-bearing XML files.
3. Grant the PostgreSQL virtual account read/execute access to the packaged
   PostgreSQL runtime, full access to `C:\BellField\data\postgres`, and write
   access only to its own service log directory.
4. Keep `bellfield-server.env` restricted to Administrators and LocalSystem
   while API/worker still run as LocalSystem; do not grant PostgreSQL access to
   API/worker XML secrets, relay token, or media token.
5. Keep API, worker, and office-web under the existing service account choice
   only as the immediate Gate 1 unblock; move them to dedicated low-privilege
   identities as a follow-up hardening slice.
6. Make service installation idempotent for retry/repair: if a previous failed
   service exists, stop/uninstall/update it safely before re-registering.
7. Add a release/service smoke that can catch this before the USB leaves:
   render manifests, inspect the PostgreSQL service XML for the account/log
   path, and on a Windows runner or VM start packaged PostgreSQL under the
   intended service identity.
8. Update the runbook to use a process-scoped execution-policy bypass until
   install scripts are signed.

This should be fixed before another full gate-day run. A manual workaround on
the scratch machine would contaminate the clean install proof.

## Relay Notes

Run #3 did not reach the relay gate because the installed services never
started. The relay professionalization work is still relevant, but it is not
the immediate Gate 1 blocker.

The USB shape was correct for the current stopgap: it supplied only
`BELLFIELD_RELAY_BASE_URL` and `BELLFIELD_RELAY_TOKEN`, while
`BELLFIELD_RELAY_SERVER_INSTANCE_ID` was generated locally by
`write-server-config.mjs`. That avoids copying a fixed machine identity between
installs.

The long-term professional relay path should still replace manual env-file
copying with activation-code provisioning:

- the installer generates the local server instance id;
- the operator enters a short-lived activation code or signs in to a
  BellField operator flow;
- the install exchanges that code for its relay base URL/token;
- the relay binds the generated server instance id server-side;
- token rotation, move-to-new-server, and revocation are explicit operator
  flows rather than copied USB secrets.

That activation work should follow the PostgreSQL service-account fix. Until
the installed services can start, the relay gate cannot be meaningfully tested.

## Result

Gate 1 remains open. Rerun #3 moved the proof line forward:

- full release ZIP packaging is now proven on the clean machine;
- packaged PostgreSQL provisioning and migrations are proven on the clean
  machine;
- service registration and ACL hardening are partially proven;
- service startup is blocked by the PostgreSQL service account.

Gates 2 through 5 were not reached.
