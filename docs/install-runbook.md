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
  Later reruns proved the repo-side SCM service-account enforcement path. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-4.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-4.md)
- fifth clean Windows gate-day attempt ran on 2026-06-20/21 with rebuilt
  artifacts carrying the SCM account enforcement path. It stopped at the
  required pre-service diagnostic before server config, PostgreSQL
  provisioning, or service installation. The diagnostic proved the preferred
  virtual account was accepted by SCM with no password, `StartName` read back
  as `NT SERVICE\bellfield-postgres`, the probe process ran as that service
  virtual account, and SID-only ACL write succeeded. It still returned failure
  because the diagnostic required the service SID to appear in `whoami /groups`
  and then crashed in the empty-password compatibility branch. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-5.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-5.md)
- sixth clean Windows gate-day attempt ran on 2026-06-21 with rebuilt artifacts
  carrying the corrected diagnostic and installer path. Clean extraction,
  server config, PostgreSQL provisioning, packaged migrations, license
  placement, service manifest rendering, and elevated service installation
  completed. `bellfield-postgres` read back as
  `NT SERVICE\bellfield-postgres`, PostgreSQL stayed running, and the
  PostgreSQL service-account ACL readbacks matched the intended narrow model.
  Gate 1 still failed because API/worker refused to start with the generated
  `BELLFIELD_RELAY_SERVER_INSTANCE_ID` present while relay base URL/token were
  empty. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-6.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-6.md)
- seventh clean Windows gate-day attempt ran on 2026-06-21 with rebuilt
  artifacts carrying the relay-disabled runtime config and installer
  stabilization gates. Clean extraction, server config, PostgreSQL
  provisioning, packaged migrations, license placement, service rendering,
  elevated service installation, PostgreSQL SCM `StartName`, ACL readback,
  packaged service evidence collection, installer service stability, and API
  `/health` all passed on the scratch machine. Gate 1 still failed at
  browser first-owner setup: `POST /identity/setup/first-owner` returned 500
  while recording a failed setup attempt because `blocked_until` is a
  `timestamptz` column and the SQL path supplied text. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-7.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-7.md)
- eighth clean Windows gate-day attempt ran on 2026-06-21 with rebuilt
  artifacts carrying the first-owner SQL fix and packaged first-owner release
  smoke proof. Its first preflight exposed a USB manifest mistake around
  mutable current-run `evidence/**` files; after the manifest was corrected, the
  same artifact set completed clean extraction, server config, PostgreSQL
  provisioning, packaged migrations, license placement, service rendering,
  elevated service installation, PostgreSQL SCM `StartName`, ACL readback,
  packaged service evidence collection, installer service stability, API
  `/health`, browser first-owner setup, browser job booking, reboot recovery,
  and post-reboot login. Gate 1 still failed at second-device LAN proof: two
  same-Wi-Fi devices timed out against the installed PC's LAN IP while local
  LAN-IP office/API checks passed and no explicit BellField/Node/3000/3001
  inbound firewall rule was found. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-8.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-8.md)
- PR #68 added the packaged Windows LAN ingress helper. The 2026-06-21 rerun-9
  USB prep rebuilt active `.17`/`.18` artifacts from source commit `991d773`
  with that helper, refreshed USB hashes, and kept `evidence/**` excluded from
  the immutable hash manifest. This is prep evidence only; Gate 1 still requires
  a cleaned-machine rerun proving effective firewall/profile readback and real
  second-device login.
- ninth clean Windows gate-day attempt ran on 2026-06-22 with active `.17`/`.18`
  artifacts. USB hash verification, `.17` extraction, packaged baseline
  collection, and `write-server-config.mjs` passed. The required elevated LAN
  helper then failed before PostgreSQL provisioning with a `Read-ServerEnvValue`
  binding error because generated env files contain blank separator lines. The
  helper had not reached the documented Public-profile refusal/consent branch,
  no firewall rules were created, and no services were rendered or installed.
  See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-9.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-9.md)
- tenth clean Windows gate-day attempt ran on 2026-06-22 with active `.19`/`.20`
  artifacts from source commit `31cd16c`. USB hash verification, `.19`
  extraction, packaged baseline collection, developer-tool PATH check, and
  `write-server-config.mjs` passed. The blank-line fix worked: the LAN helper
  reached the intended Public-profile refusal and, after explicit operator
  consent, changed Wi-Fi to Private and created BellField-managed TCP
  `3000`/`3001` Private/Domain LocalSubnet firewall rules. It then failed its
  own effective-rule validation before PostgreSQL provisioning, apparently
  because the helper validated `RemoteAddress` from the port filter instead of
  the address filter. No services were rendered or installed. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-10.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-10.md)
- eleventh clean Windows gate-day attempt ran on 2026-06-22 with active
  `.21`/`.22` artifacts from source commit `8154dc8`. USB hash verification,
  `.21` extraction, packaged baseline collection, LAN helper Public-profile
  refusal, explicit trusted-LAN consent, Private profile readback, BellField
  firewall rule creation, LAN env URL updates, PostgreSQL provisioning,
  packaged migrations, license placement, service rendering, elevated service
  installation, PostgreSQL SCM `StartName`, ACL readback, packaged service
  evidence collection, installer service stability, API `/health`, browser
  first-owner setup, browser job/appointment proof, reboot recovery, and
  post-reboot login all passed. Gate 1 still failed before real second-device
  browser proof because the packaged LAN evidence collector hung while reading
  firewall evidence and wrote no stdout or JSON. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-11.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-11.md)
- twelfth clean Windows gate-day attempt ran on 2026-06-23 with active
  `.23`/`.24` artifacts from source commit `0a6d4ed`. USB hash verification,
  `.23` extraction, packaged baseline collection, LAN helper Public-profile
  refusal, explicit trusted-LAN consent, Private profile readback, BellField
  firewall rule creation, LAN env URL updates, PostgreSQL provisioning,
  packaged migrations, license placement, service rendering, elevated service
  installation, PostgreSQL SCM `StartName`, ACL readback, packaged service
  evidence collection, installer service stability, API `/health`, browser
  first-owner setup, browser customer/location/job proof, reboot recovery, and
  post-reboot service/API health all passed. Gate 1 stopped at post-reboot
  browser login because the newly created owner password existed only in
  transient Codex/browser automation state and was unavailable after reboot. The
  run did not reach packaged LAN evidence or real second-device login. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-12.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-12.md)
- thirteenth clean Windows gate-day attempt ran on 2026-06-23 with the same
  active `.23`/`.24` artifacts and the fixed documented Gate Day owner
  credential. Gate 1 passed: USB hashes, extraction, baseline collection, LAN
  Public-profile refusal/consent, LAN env/firewall setup, PostgreSQL
  provisioning, packaged migrations, license placement, service rendering,
  elevated service installation, PostgreSQL SCM `StartName`, ACL readback,
  service evidence, API `/health`, browser first-owner setup, customer/location
  job proof, reboot recovery, post-reboot login, packaged LAN evidence, and
  real second-device browser login all passed. The strict run then stopped at
  Gate 2 because the documented packaged manual backup CLI could not find
  `pg_dump.exe`. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-13.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-13.md)
- fourteenth clean Windows gate-day attempt ran on 2026-06-23 with rebuilt
  `.25`/`.26` artifacts from source commit `a730639`. Gate 1 passed again:
  clean install, LAN Public-profile refusal/consent, service installation,
  PostgreSQL SCM `StartName`, ACL readback, first-owner setup, job proof,
  reboot recovery, packaged LAN evidence, and real iPhone same-Wi-Fi login all
  passed. Gate 2 advanced past the rerun #13 backup blocker: the packaged manual
  backup helper produced a fresh backup set with `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`. Restore then failed
  because the old restore helper tried to recreate the database with the runtime
  app role and PostgreSQL returned `permission denied to create database`. The
  repo-side follow-up restores through the owned schema path without granting the
  runtime app role permanent `CREATEDB`; rerun #15 proved that fix. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-14.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-14.md)
- fifteenth clean Windows gate-day attempt ran on 2026-06-24 with rebuilt
  `.27`/`.28` artifacts from source commit `d60afaf`. Gate 1 passed again.
  Gate 2 passed for the first time: packaged manual backup created a fresh
  backup set, restore completed through the owned-schema path, services
  restarted, login worked, pre-backup data survived, and the post-backup marker
  was erased. Gate 3 failed during the real `.27` to `.28` update: the updater
  continued after the outer wrapper timeout, created a pre-update backup, staged
  `.28`, left `.27` installed, and left API/worker/office-web stopped. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-15.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-15.md)
- seventeenth clean Windows gate-day attempt ran on 2026-06-27 with rebuilt
  `.31`/`.32` artifacts from source commit `233e061`. Gate 1 and Gate 2 passed
  again; restore readiness retried service start once and recovered to health
  `ok`. Gate 3 failed because overlapping elevated updater attempts were
  allowed after a capture timeout. Final closeout showed `.32` installed, `.31`
  preserved as rollback, a fresh pre-update backup present, all BellField
  services stopped, and health down. See
  [gate-day-clean-windows-smoke-2026-06-20-rerun-17.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-17.md)
- release-build smoke now functionally validates bundled PostgreSQL by running
  packaged `initdb`, `pg_ctl`, `postgres`, and `psql` against a temporary data
  directory when gate-day dependencies are included, and checks the app-local
  VC++ runtime DLLs required by the Windows PostgreSQL bundle
- repo-side runtime-config tests and `pnpm smoke:install-config` now prove the
  generated clean-install relay-disabled env shape is accepted by API and
  worker: base URL/token blank means relay disabled even though
  `BELLFIELD_RELAY_SERVER_INSTANCE_ID` is generated
- repo-side identity-attempt SQL now has a PostgreSQL-backed regression test,
  and the gate-day release ZIP smoke must prove both controlled invalid
  first-owner token handling and successful first-owner creation before USB
  prep
- the Windows service installer now validates packaged API/worker runtime
  config and license readability before service startup, then requires service
  state/process-id stability and API `/health` before reporting success
- a packaged elevated read-only service evidence collector exists at
  `tools\install\collect-windows-service-evidence.ps1`

Current clean-machine validation status:

- clean Windows Gate 1 passed in rerun #15 for the entry-tier install
  path: no developer tooling, real services, first-owner setup, job proof,
  reboot recovery, packaged LAN evidence, and real second-device browser login
  in one strict run
- a green run of the packaged service-account diagnostic (supporting preflight
  evidence only, not the gate; now uses corrected virtual-account proof criteria)
- Windows LAN/firewall reachability for office web on a second device; rerun #8
  proved local install, owner setup, job booking, reboot recovery, and
  post-reboot login, but second-device same-Wi-Fi access timed out; rerun #9
  stopped earlier because the packaged LAN helper could not read generated env
  files containing blank separator lines; rerun #10 proved that fix reached the
  Public-profile consent branch but stopped because firewall effective-rule
  validation checked remote address on the wrong filter object; rerun #11 proved
  the address-filter fix through service install, first-owner setup, browser
  job/appointment proof, reboot recovery, and post-reboot login but stopped
  when the packaged LAN evidence collector hung; rerun #12 used the hardened
  exact-rule collector artifact and proved service install, browser owner setup,
  job booking, reboot recovery, and post-reboot service/API health, but stopped
  before post-reboot browser login because the test owner password was only in
  transient automation state. Rerun #13 used the documented Gate Day dummy
  credential and passed post-reboot login, packaged LAN evidence, and real
  second-device browser login from an iPhone on the same Wi-Fi
- second office desktop and Android field-device proof remain separate optional
  environmental checks
- scratch-machine backup/restore drill. Rerun #15 proved packaged manual backup
  creation, restore through the owned-schema path, service restart, marker
  erasure, login, pre-backup data readback, media read/write, and license
  readback. The helper still has an operator-experience rough edge: immediate
  `/health` failed once after restore before a bounded retry returned `ok`.
- real installed v(N) to v(N+1) update with Windows services, real pre-update
  `pg_dump`, health check, and reboot/service recovery proof. Rerun #15 created
  a pre-update backup and staged `.28`, but did not complete the swap/restart
  path and left app services stopped.

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
pnpm smoke:install-helpers
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
resolution and office-web startup from the extracted tree. The release ZIP
smoke must pass with its evidence path recorded before the ZIP is USB-ready;
with gate-day deps required, it also proves packaged backup and restore return
database marker data, media bytes, and license bytes to the backup-set state.

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

Before mutating the machine, capture a read-only baseline snapshot:

```powershell
.\release\tools\install\collect-windows-install-baseline.ps1 `
  -InstallRoot C:\BellField `
  -UsbRoot <usb-root> `
  -OutputPath <usb-evidence-path>\install-baseline-rerun-N.json
```

The baseline collector records OS/build, machine name, elevation, PowerShell
version, USB/root evidence, network profile/IP basics, existing BellField
services, install-root path existence, and free disk. It does not read service
logs or env files.

## Write Server Config

On the server, choose a fixed install root such as `C:\BellField`.

```powershell
.\release\runtime\node\node.exe .\release\tools\install\write-server-config.mjs --install-root=C:\BellField
```

This writes `C:\BellField\bellfield-server.env`, creates the configured local
data-root folders, and generates secrets. It does not initialize the
PostgreSQL data directory; `C:\BellField\data\postgres\PG_VERSION` appears only
after `provision-postgres.mjs` initializes PostgreSQL. Do not commit or share
the env file, and do not record the generated database password separately in
gate evidence or customer notes; the restricted env file is the source of truth.

The config helper generates a non-empty
`BELLFIELD_RELAY_SERVER_INSTANCE_ID` while `BELLFIELD_RELAY_BASE_URL` and
`BELLFIELD_RELAY_TOKEN` remain empty. That is the supported clean-install
relay-disabled state: base URL + token enable the relay, while the instance id
is server identity kept ready for later activation. Do not paste relay
credentials merely to make Gate 1 services start; Gate 1 must pass before relay
activation.

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

## Configure LAN Access

Before rendering service manifests, configure the trusted shop LAN URL and
managed Windows Firewall rules from an elevated PowerShell session:

```powershell
.\release\tools\install\configure-windows-lan-access.ps1 -InstallRoot C:\BellField
```

The helper selects the default-route non-loopback IPv4 address unless `-LanIp`
or `-LanHost` is passed. It updates only:

- `NEXT_PUBLIC_API_BASE_URL=http://<lan-host>:<api-port>`
- `BELLFIELD_OFFICE_ORIGINS=http://localhost:<office-port>,http://127.0.0.1:<office-port>,http://<lan-host>:<office-port>`

It does not touch `DATABASE_URL`, does not change PostgreSQL configuration, and
does not open port `5432`. PostgreSQL remains local-only.

The helper manages only two Windows Firewall rules in the `BellField` group:
internal names `BellField-Office-Web-TCP-Inbound` and
`BellField-API-TCP-Inbound`, with display names
`BellField Office Web TCP Inbound` and `BellField API TCP Inbound`. They are
TCP-only, use the configured office/API ports, apply to `Private,Domain`
profiles, and are scoped to `LocalSubnet`. The helper removes and recreates
only those exact managed internal names so reruns do not accumulate duplicate
rules.

If the selected LAN profile is `Public`, the helper fails closed by default and
prints the interface alias/index plus a copyable
`Set-NetConnectionProfile -InterfaceAlias '<alias>' -NetworkCategory Private`
command. On an assisted install where the operator confirms this is the trusted
shop LAN, rerun the helper with `-SetCurrentNetworkPrivate`; the helper logs
the change and reads the profile back before continuing. Do not open Public
profile inbound rules for Gate 1.

For uninstall/cleanup, remove only the BellField-managed rules:

```powershell
.\release\tools\install\remove-windows-lan-access.ps1
```

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

For the current assisted path, run the packaged migration helper before
registering services. It starts the packaged PostgreSQL server with
`pg_ctl -l <logfile>`, runs API migrations with the bundled Node runtime, then
stops PostgreSQL only if the helper started it:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\run-packaged-migrations.mjs --install-root=C:\BellField
```

For evidence capture, avoid wrapping a raw `pg_ctl start` in a PowerShell
pipeline. Rerun #4 showed that background PostgreSQL can inherit the captured
stream and keep the command open until the wrapper times out. The packaged
helper uses `pg_ctl -l <logfile>` and tails redacted logs on failure.

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

After LAN access has configured the env file, render WinSW manifests:

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
the unrestricted service SID, then applies ACLs before startup. It then runs the
packaged runtime-config validator, starts services in order, confirms each one
is `Running`, waits through a 30-second settle window, requires stable nonzero
process IDs across that window, and polls API `/health` for `status: "ok"`. If
SCM does not read back the expected PostgreSQL service identity, runtime
config/license validation fails, a service exits or restarts, or health does not
pass, the install fails instead of printing success.

The PostgreSQL WinSW XML deliberately does not contain `<serviceaccount>`.
Run #4 proved XML account shape is insufficient: the XML contained
`NT SERVICE\bellfield-postgres`, but the installed Windows service still
reported `LocalSystem`. Treat SCM `StartName` readback and service startup as
the proof, not manifest inspection.

After the installer returns, still capture the installed service state from
Windows for evidence. Rerun #6 showed why this is mandatory: older artifacts
could print success while API/worker then crashed with service `ExitCode 1067`.
Current artifacts should fail inside the installer if that happens, with service
state and log tails printed for diagnosis.

```powershell
Start-Sleep -Seconds 20
Get-CimInstance Win32_Service |
  Where-Object { $_.Name -like 'bellfield-*' } |
  Select-Object Name, State, StartMode, StartName, ExitCode, ProcessId, PathName
```

Stop the gate if any auto-start BellField service is not `Running`, if
`bellfield-postgres` does not read back as
`NT SERVICE\bellfield-postgres`, or if API/worker logs show a configuration
startup refusal. Continuing after editing env values by hand is diagnostic only,
not a clean Gate 1 pass.

For a packaged evidence snapshot after install, run from elevated PowerShell:

```powershell
.\release\tools\install\collect-windows-service-evidence.ps1 `
  -InstallRoot C:\BellField `
  -OutputPath D:\BellField-GateDay-2026-06-20\evidence\service-evidence-rerun-N.json
```

The collector summarizes env key presence/blank state without printing secret
values and redacts service log tails, `sc.exe` output, `icacls` output, and
Service Control Manager event messages before writing JSON/stdout. It redacts
first-owner setup tokens, relay tokens, `DATABASE_URL`, media token secrets,
`PGPASSWORD`, libpq keyword-form `password=...`, session/setup/password JSON
fields, bearer-looking relay/token values, and private-key-looking blocks.
Because this evidence may be shared, the collectors intentionally redact broad
`token=...` and `password=...` forms; benign strings with those names can be
redacted too. Preserve raw logs locally only when deeper debugging requires
them.

After any redaction or evidence polish pass, parse JSON evidence before calling
the evidence clean:

```powershell
Get-Content -Raw D:\BellField-GateDay-2026-06-20\evidence\service-evidence-rerun-N.json | ConvertFrom-Json | Out-Null
```

Rerun #15 showed why this matters: the setup-token value was removed from
`service-evidence-rerun-15.json`, but the post-collection redaction left the JSON
malformed.

The packaged service-account diagnostic is a preflight/qualification tool, not a
step in the clean install and not the gate itself. The authoritative proof of
the PostgreSQL service identity is the installer's own SCM `StartName` readback
plus real PostgreSQL/service startup. A diagnostic run that fails for tool
reasons must not block a Gate 1 install whose installer readback and service
start both pass; equally, a genuine diagnostic failure must be investigated, not
waved off. The install's pass/fail authority is the installer, not this script.

Before rebuilding gate-day artifacts to close the service-identity blocker, run
the elevated diagnostic with the same WinSW binary and save the JSON result.
The default gate command should clean up its temporary service/artifacts:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\release\tools\install\diagnose-windows-service-account.ps1 -WinSwExe .\release\tools\winsw\WinSW-x64.exe
```

On a cleaned scratch machine the default diagnostic service id is
`bellfield-postgres`, so it proves the exact virtual account name the installer
uses. If a machine already has a BellField service, clean it first or pass a
temporary `-ServiceId`; the script refuses to modify an existing service.

Use `-KeepArtifacts` only for an explicitly diagnostic residue-preserving run.
Rerun #5 showed that presenting `-KeepArtifacts` in the ordinary gate command
conflicts with the USB expectation that the temporary diagnostic service cleans
up after itself.

If Codex is running from a non-elevated PowerShell session, the human operator
still owns the UAC prompt. Use a wrapper like this to launch the diagnostic
elevated while capturing stdout/stderr to the active USB evidence file:

```powershell
$diagnosticOutput = "D:\BellField-GateDay-2026-06-20\evidence\service-account-diagnostic-rerun-N.json"
$diagnosticScript = @"
& 'C:\BellField\release\tools\install\diagnose-windows-service-account.ps1' -WinSwExe 'C:\BellField\release\tools\winsw\WinSW-x64.exe' *> '$diagnosticOutput'
exit `$LASTEXITCODE
"@
$encodedDiagnostic = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($diagnosticScript))
$diagnosticProcess = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-EncodedCommand",
  $encodedDiagnostic
)
$diagnosticProcess.ExitCode
```

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

With a fresh migrated database and no active employees, the API logs a one-time
setup token:

```text
BellField first-owner setup token: ...
```

Use the packaged helper from an elevated PowerShell session to copy the latest
token line without printing the token into evidence:

```powershell
.\release\tools\install\copy-first-owner-setup-token.ps1 -InstallRoot C:\BellField
```

Open the office web app. On a clean install the office auth shell shows the
setup form after it can reach the API and confirm setup is required. If the
setup form is not visible, enter the installed server URL in the auth shell's
server/API URL field first: use `http://localhost:3001` on the installed PC, or
the configured LAN API URL such as `http://<scratch-lan-ip>:3001` from another
device. Do not navigate the office browser directly to
`http://localhost:3000/identity/setup/first-owner`; `/identity/setup/first-owner`
is the API endpoint, not an office-web route. Paste the token into the setup
form and create the first owner account.

For a disposable Gate Day scratch-machine run that includes reboot and
post-reboot login proof, create the owner through the real browser setup flow
with this fixed test-only credential:

```text
Display name: Gate Day Owner
Email: gate.owner@example.com
Password: BellFieldGateDay!2026
```

This credential is intentionally public and non-production. It gives Codex a
durable login source before and after reboot without bypassing the first-owner
setup UI. Do not use this credential for customer installs, generated database
passwords, relay credentials, license files, or any production secret. Prefer
recording `used documented Gate Day dummy credential: yes` instead of echoing
the password into evidence logs. If the exact dummy password appears in
evidence, treat it as an allowlisted test value; any non-dummy owner password,
setup token, database URL, relay token, or generated secret remains a hygiene
failure. Rerun #12 stopped at post-reboot login because the owner password only
existed in transient Codex/browser automation state; rerun #13 used the fixed
documented Gate Day dummy credential and passed post-reboot login plus real
second-device browser login.

After service ACL hardening, non-elevated shells may not be able to read service
logs or PostgreSQL paths. If setup-token metadata, startup errors, or ACL
readbacks are needed for evidence, capture them from an elevated read-only
PowerShell session and redact secret values before copying to the evidence file.

If multiple token lines exist, use the latest one; the token is in-memory and
can change after an API restart. If the token is copied to the Windows clipboard
for handoff into the browser, overwrite the clipboard with a harmless
placeholder after use. Rerun #7 showed that `Set-Clipboard` may reject an empty
string on the scratch-machine PowerShell environment.

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

## LAN / Second-Device Reachability

Gate 1 is not closed until another device on the same LAN can open the office
app and log in. Rerun #8 proved why this is a separate check: services were
healthy locally, and the installed PC could reach its own LAN IP, but two
same-Wi-Fi devices timed out because the runbook/installer had not created or
verified a Windows Firewall/network-profile path for inbound LAN traffic.

The LAN config helper now owns the supported firewall/profile path. Capture the
packaged read-only LAN evidence before trying the second device:

```powershell
.\release\tools\install\collect-windows-lan-evidence.ps1 `
  -InstallRoot C:\BellField `
  -OutputPath <usb-evidence-path>\lan-evidence-rerun-N.json
```

The collector records network profiles, candidate/chosen LAN IP, listeners for
the office/API ports, local-origin installed-PC LAN URL checks, exact
BellField-managed firewall rule readback, and `effectiveLanAccess` reasons. Its
URL checks are labeled `origin = "installed-pc"` and
`provesRemoteReachability = false`; they prove local binding behavior only. The
collector does not create firewall rules, change the network profile, or replace
the actual second-device login proof. Rerun #11 showed the older packaged
collector could hang while enumerating broad firewall evidence; rerun #13 proved
the exact-rule collector artifact on the clean machine, then a real iPhone
same-Wi-Fi browser login closed the Gate 1 LAN proof.

Then open `http://<scratch-lan-ip>:3000` from the second device and log in.
Only a real second-device login closes the Gate 1 LAN proof. If
`effectiveLanAccess` is false, or local LAN-IP checks pass but the second device
times out, stop the strict gate and record the firewall/profile evidence.

## Backup And Restore

The worker creates scheduled backup sets under `BELLFIELD_BACKUP_ROOT`.
Each set includes:

- `database.dump` from PostgreSQL custom-format `pg_dump`
- a recursive copy of `BELLFIELD_MEDIA_ROOT`
- `license\bellfield-license.json` when `BELLFIELD_LICENSE_PATH` is configured
- `manifest.json`

The System surface shows the latest successful backup and warns when it is stale.

Rerun #13 proved the worker can create a scheduled backup set on the installed
machine, but the documented manual Gate 2 command failed from an elevated shell
with `pg_dump.exe failed: spawn pg_dump.exe ENOENT`. Rerun #14 proved the
packaged backup helper fix: it produced a fresh worker backup set with the
required shape on the clean install. Use the packaged backup helper as the Gate
2 operator command:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\run-packaged-backup.mjs --install-root=C:\BellField
```

Restore is assisted and destructive. Use:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\restore-backup.mjs --release-root=.\release --install-root=C:\BellField --backup-set=<backup-set-path> --confirm=RESTORE
```

Rerun #14 proved the old restore helper must not drop/recreate the database with
the runtime app role; that role intentionally does not have `CREATEDB`. The
current helper restores through the owned database/schema path instead. Rerun
#15 proved Gate 2 with rebuilt `.27`: a real worker backup restored through the
owned-schema path, app services restarted, login worked, pre-backup data
survived, and the post-backup marker disappeared. The run still found a rough
edge: the first immediate `/health` probe after restore failed before a bounded
retry returned `ok`. The restore helper now reports data/media/license restore
completion separately from final API readiness; a readiness failure is a
service-readiness problem, not a reason to rerun the destructive restore. Keep
an explicit manual `/health` probe afterward as recorded evidence.

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

1. Acquires a single active-update lock under the install root. If another
   updater is already running, stop and inspect that process instead of
   retrying.
2. Verifies `bellfield-update-manifest.json` and `bellfield-update-signature.json`.
3. Verifies the installed license file from `BELLFIELD_LICENSE_PATH`.
4. Refuses the update when the artifact `releaseDate` is after the license
   `updateWindowEnd`.
5. Stage-copies the new release beside the current release root using a
   race-safe staged directory.
6. Runs a hard-fail pre-update backup through the packaged worker manual backup CLI.
7. Stops office-web, worker, API, and PostgreSQL with bounded per-service timeouts.
8. Waits, best-effort, for the captured WinSW service process trees to exit.
9. Swaps the staged release into `--current-release-root` with a bounded retry;
   the successful rename is the proof that Windows file handles have cleared.
10. Preserves the prior release as a timestamped rollback directory.
11. Starts PostgreSQL from the new release.
12. Runs packaged migrations.
13. Restarts API, worker, and office-web and waits for `/health`.

The updater prints structured progress lines:

- `BELLFIELD_UPDATE_PHASE` before/after each destructive phase
- `BELLFIELD_UPDATE_RESULT` on success
- `BELLFIELD_UPDATE_FAILURE` on failure, including phase, recovery action,
  staged path, rollback path, pre-update backup path, installed/attempted
  versions, and service-state readback

Operator-visible timeout overrides are available for unusually slow customer
hardware: `--backup-timeout-ms`, `--service-timeout-ms`,
`--service-exit-timeout-ms`, `--swap-timeout-ms`,
`--migration-timeout-ms`, and `--health-timeout-ms`. Treat an override as
evidence to record, not a normal default.

For scratch validation only, the updater supports `--skip-services=true`,
`--skip-health=true`, and `--skip-backup=true`. Do not use those skips for a
customer update.

Rerun #15 exposed the update blocker: the real `.27` to `.28` updater run
continued after the outer wrapper timed out, created a fresh pre-update backup,
staged `.28`, left `.27` installed, and left API/worker/office-web stopped.
Rerun #16 proved structured updater phase/result/failure lines and pre-swap
recovery, but the release swap still failed while PostgreSQL was running from
inside the live release tree. Rerun #17 stopped PostgreSQL as part of the update
stop set, but the strict proof was invalidated by overlapping elevated updater
attempts after a hidden capture timeout.

After any UAC/capture timeout, do not immediately retry the updater. First
search for an already-running `update-bellfield` or artifact `node.exe` process,
record the result, and only retry if no updater is active. The updater lock is a
product safety net; the operator runbook should still avoid overlapping attempts
because a destructive update may already be past staging or backup.

If an update fails before the release swap, the current release should still be
intact; the updater removes the abandoned staged release path and attempts to
restart the original app services. If an update fails after the release swap,
preserve the printed rollback release directory and restore the pre-update
backup using
[restore-runbook.md](./restore-runbook.md).

## Uninstall / Repair Notes

For now, assisted uninstall is manual:

1. Stop BellField services.
2. Uninstall WinSW services in reverse order.
3. Preserve `C:\BellField\bellfield-server.env`, PostgreSQL data, media, license, and backups unless the customer explicitly approves deletion.
4. Remove generated service executables/manifests and release files.

Repair should rerun config rendering and service installation without deleting data directories.
