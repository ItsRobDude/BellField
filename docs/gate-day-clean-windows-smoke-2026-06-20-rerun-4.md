# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 4

This records the fourth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-4-2026-06-20.md`,
`evidence/command-log-rerun-4.txt`,
`evidence/install-services-elevated-transcript-rerun-4.txt`, and
`evidence/inspect-services-elevated-transcript-rerun-4.txt`. This repo doc is
the sanitized, durable summary.

Status: **failed at Gate 1 service startup**.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260620.7.zip`
  - version: `0.0.1-gateday.20260620.7`
  - release date: `2026-06-20`
  - source commit: `71f5807`
  - SHA256:
    `E788C266948098D59E8C77AD1E02895AC79607E4B82098C4532F7AC1DD21036D`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260620.8.zip`
  - version: `0.0.1-gateday.20260620.8`
  - release date: `2026-06-20`
  - source commit: `71f5807`
  - SHA256:
    `FC2013FB37604DE0505E77335FFC4D6CB43B482E84A4FF1000C9B450279B4C44`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- Operator state: Codex was not elevated; human approved UAC prompts when
  required
- Network: Wi-Fi `192.168.50.131`
- USB drive letter: `D:`
- `C:\BellField` was absent before the run
- No disallowed developer tooling was found on `PATH` for:
  `git`, `node`, `pnpm`, `npm`, `yarn`, `bun`, `psql`, `postgres`, `pg_ctl`,
  `pg_dump`, `pg_restore`, `docker`, or `code`
- Required USB files were present, including
  `docs\codex-install-test-operator-rules.md`
- The private relay config contained only the expected key names:
  `BELLFIELD_RELAY_BASE_URL` and `BELLFIELD_RELAY_TOKEN`; values were not
  logged

## What Passed

Run #4 confirmed that the USB/documentation repair after run #3 was effective
and reconfirmed the release-packaging fixes on another clean Windows machine:

- Active artifact hashes matched `SHA256SUMS.txt`.
- The missing `docs\codex-install-test-operator-rules.md` problem was closed;
  the file existed on the USB and was read before install work began.
- Artifact `.7` extracted to `C:\BellField` using Windows built-in `tar.exe`.
- `release\bellfield-build-manifest.json` reported
  `0.0.1-gateday.20260620.7` and `licenseRequired=true`.
- `write-server-config.mjs` generated `C:\BellField\bellfield-server.env`,
  local data directories, and `BELLFIELD_RELAY_SERVER_INSTANCE_ID` without
  printing secret values.
- Bundled runtime files existed:
  - `release\runtime\node\node.exe`
  - `release\postgres\bin\initdb.exe`
  - `release\postgres\bin\pg_ctl.exe`
  - `release\postgres\bin\postgres.exe`
  - `release\postgres\bin\psql.exe`
  - `release\postgres\bin\pg_dump.exe`
  - `release\postgres\bin\pg_restore.exe`
  - `release\postgres\lib`
  - `release\postgres\share\postgres.bki`
  - `release\postgres\bin\vcruntime140.dll`
  - `release\postgres\bin\vcruntime140_1.dll`
  - `release\postgres\bin\msvcp140.dll`
  - `release\tools\winsw\WinSW-x64.exe`
- `provision-postgres.mjs` initialized
  `C:\BellField\data\postgres`, created or updated the app role/database, and
  changed TCP host authentication to `scram-sha-256`.
- Temporary PostgreSQL start was confirmed with `pg_ctl status`.
- Packaged API migrations ran from the extracted release tree using the Node
  driver and completed successfully.
- Temporary PostgreSQL stopped cleanly after migrations.
- The valid license was copied to
  `C:\BellField\data\license\bellfield-license.json`.
- `render-windows-services.mjs` produced four WinSW service manifests.
- The packaged service installer registered all four Windows services:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- Elevated ACL readback showed the intended hardened shape for the checked
  paths:
  `bellfield-server.env` restricted to `SYSTEM` and `Administrators`, and
  PostgreSQL runtime/data/log paths granting the intended
  `NT SERVICE\bellfield-postgres` access.

## What Failed

The elevated service install failed on `Start-Service bellfield-postgres`.

The installer output:

```text
INSTALL SCRIPT ERROR: Failed to start service 'BellField PostgreSQL (bellfield-postgres)'.
Install script exit code: 1
```

Service readback showed all BellField services stopped, with PostgreSQL still
registered as `LocalSystem`:

```text
Name                 State   StartMode StartName   PathName
----                 -----   --------- ---------   --------
bellfield-postgres   Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-postgres.exe"
bellfield-api        Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-api.exe"
bellfield-worker     Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-worker.exe"
bellfield-office-web Stopped Auto      LocalSystem "C:\BellField\release\services\bellfield-office-web.exe"
```

`sc.exe qc bellfield-postgres` confirmed:

```text
SERVICE_START_NAME : LocalSystem
```

This happened even though the rendered WinSW XML contained the intended service
account block:

```xml
<serviceaccount>
  <username>NT SERVICE\bellfield-postgres</username>
  <allowservicelogon>true</allowservicelogon>
</serviceaccount>
```

The PostgreSQL error log repeated:

```text
Execution of PostgreSQL by a user with administrative permissions is not
permitted.
The server must be started under an unprivileged user ID to prevent
possible system security compromises.
```

The API, worker, and office-web services did not start because PostgreSQL did
not start.

## Diagnosis

Run #4 changes the diagnosis from "manifest does not describe the right service
identity" to "the installed Windows service does not use the identity described
by the manifest."

The service-manifest smoke introduced before this run proved only XML shape.
It did not prove that WinSW would apply the account during service install on a
clean Windows machine.

The evidence shows:

- BellField rendered `<serviceaccount>` correctly in
  `bellfield-postgres.xml`.
- The packaged WinSW executable registered the service successfully.
- The installed SCM service account remained `LocalSystem`.
- PostgreSQL refused to run under that administrative account.

WinSW's XML docs describe `<serviceaccount><username>...</username>` support
for built-in and named accounts, and there is also an open WinSW issue
reporting similar `LocalSystem` behavior
([winsw/winsw#971](https://github.com/winsw/winsw/issues/971)). Treat those as
background only. Run #4 did not prove whether the root cause is a WinSW bug, a
virtual-service-account support boundary, a version/command behavior, or
BellField installer logic. It proved the product needs an actual Windows SCM
account enforcement/readback step before service startup.

## Operator Hiccups And Complaints

These were not the primary product blocker, but they made the run rougher than
it should be:

| Category           | Severity | Step                        | What happened                                                                                                                                      | Follow-up                                                                                                                                                   |
| ------------------ | -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runbook-gap        | minor    | Extraction                  | `install-runbook.md` said to extract the ZIP but did not prescribe a command. The first `Expand-Archive` attempt exceeded Codex's command timeout. | Add a copyable Windows built-in extraction command. `tar.exe -xf ... -C C:\BellField` worked for run #4 and keeps the gate path reproducible.               |
| automation-hiccup  | minor    | Temporary PostgreSQL start  | Capturing `pg_ctl start` through a PowerShell pipeline left the background `postgres` process holding the stream open, causing a Codex timeout.    | Use `pg_ctl -l <logfile>` and read the log separately; do not pipe-capture the background PostgreSQL start.                                                 |
| evidence-hiccup    | minor    | Elevated install transcript | The elevated readback command used malformed `Get-CimInstance -Filter Name like 'bellfield-%'`, so that specific readback failed.                  | Quote the full `-Filter` string or use the working `Where-Object` pattern: `Get-CimInstance Win32_Service \| Where-Object { $_.Name -like 'bellfield-*' }`. |
| hardening-friction | expected | Post-install inspection     | Non-elevated Codex could not read service XML/log paths after ACL hardening.                                                                       | This is expected hardening, but the runbook should make clear that service XML/log inspection after install requires an elevated read-only pass.            |
| evidence-hygiene   | minor    | Evidence template           | The top `Status: not started` line and checkboxes were not updated in place; the real status appeared only in appended notes.                      | Future operators should update the status/checklists as they go, not only append a closeout.                                                                |
| log-noise          | minor    | Failed service startup      | WinSW restart-on-failure retried PostgreSQL repeatedly, producing repeated administrative-account errors.                                          | During install, assert the service identity before `Start-Service`; do not let retry noise obscure the first cause.                                         |

## Recommended Fix

The next focused fix should be service-account enforcement, not another XML
shape tweak:

1. Prove the chosen account path in a tiny elevated Windows diagnostic before
   rebuilding artifacts: `NT SERVICE\bellfield-postgres` if Windows SCM accepts
   it reliably for this service wrapper path; otherwise choose a known-supported
   low-privilege account such as `LocalService` or an installer-created local
   account, with ACLs adjusted deliberately.
2. Keep WinSW XML responsible for wrapper/runtime/logging shape only. Do not
   rely on `<serviceaccount>` for PostgreSQL; set the service account through
   SCM and make that the single source of truth.
3. Immediately read back `Win32_Service.StartName` / `sc.exe qc` before
   `Start-Service`; fail with a clear error if `bellfield-postgres` is not
   installed as the intended low-privilege identity.
4. Add/run a Windows service-account diagnostic that installs a temporary
   `bellfield-postgres` service, asserts the actual SCM `StartName`, captures
   `whoami /groups`, and proves service-SID ACL access.
5. Update `install-windows-services.ps1` so a failed service start leaves a
   clearer final state and diagnostic message.
6. Rebuild/resign/package new artifacts, regenerate the USB hash list, and
   rerun Gate 1 from a clean machine/state.

Do not workaround this manually on the scratch machine. A manual service-account
edit would be a diagnostic run, not a clean install pass.

## Relay Notes

Run #4 did not reach the relay gate because the installed services never
started.

The USB relay stopgap shape was correct for this run: it supplied only
`BELLFIELD_RELAY_BASE_URL` and `BELLFIELD_RELAY_TOKEN`, while
`BELLFIELD_RELAY_SERVER_INSTANCE_ID` was generated locally by
`write-server-config.mjs`. No relay token values were recorded.

Activation-code provisioning remains the professional long-term relay path, but
it is still behind the service-start blocker. Until Gate 1 can start services,
the relay send/acceptance/poll-ack gate cannot be meaningfully tested.

## Result

Gate 1 remains open. Rerun #4 proved:

- the USB docs were repaired enough for preflight;
- release ZIP packaging remained sound on a clean Windows 11 Home machine;
- packaged PostgreSQL provisioning and migrations work on the clean machine;
- service manifest rendering and ACL hardening mostly work;
- WinSW XML `<serviceaccount>` did not translate into the installed SCM service
  account.

Gates 2 through 5 were not reached.
