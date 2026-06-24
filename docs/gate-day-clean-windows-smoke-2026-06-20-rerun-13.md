# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 13

This records the thirteenth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-13-2026-06-23.md`,
`evidence/RERUN-13-READ-ME-FIRST.md`,
`evidence/command-log-rerun-13.txt`,
`evidence/install-baseline-rerun-13.json`,
`evidence/service-evidence-rerun-13.json`,
`evidence/lan-evidence-rerun-13.json`,
`evidence/evidence-hygiene-rerun-13.txt`, and supporting rerun-13 transcripts.
This repo doc is the sanitized, durable summary.

Status: **Gate 1 passed; the strict run stopped as failed at Gate 2 before
restore because the documented packaged manual backup CLI could not find
`pg_dump.exe`**.

This is the first strict clean Windows run to prove the full Gate 1 path:
clean install, services, browser owner setup, job booking, reboot recovery,
packaged LAN evidence, and real second-device browser login.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260623.23.zip`
  - version: `0.0.1-gateday.20260623.23`
  - release date: `2026-06-23`
  - source commit: `0a6d4ed`
  - SHA256:
    `6a40b347444be6053841b43bb0280f0c037e2c9dd9ab7caaf3a4e682737c621d`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260623.24.zip`
  - version: `0.0.1-gateday.20260623.24`
  - release date: `2026-06-23`
  - source commit: `0a6d4ed`
  - SHA256:
    `2e446cdbc0dbe15ef4d0311ec0a60ea43563a1979958d1f8a154f2c7e667cc87`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

The USB hash verifier passed before extraction and again after mutable evidence
cleanup:

```text
status: ok
checked: 120
failed: 0
```

## Raw Evidence Files

- `evidence/RERUN-13-READ-ME-FIRST.md`
- `evidence/gate-day-rerun-13-2026-06-23.md`
- `evidence/command-log-rerun-13.txt`
- `evidence/install-baseline-rerun-13.json`
- `evidence/lan-config-initial-rerun-13-transcript.txt`
- `evidence/lan-config-set-private-rerun-13-transcript.txt`
- `evidence/install-services-rerun-13-transcript.txt`
- `evidence/service-evidence-rerun-13.json`
- `evidence/service-evidence-collector-rerun-13-transcript.txt`
- `evidence/service-acl-readback-rerun-13-transcript.txt`
- `evidence/copy-first-owner-token-rerun-13-transcript.txt`
- `evidence/lan-evidence-rerun-13.json`
- `evidence/lan-evidence-collector-rerun-13-transcript.txt`
- `evidence/manual-backup-rerun-13-transcript.txt`
- `evidence/manual-backup-rerun-13-explicit-transcript.txt`
- `evidence/manual-backup-rerun-13-explicit-output.txt`
- `evidence/worker-service-env-shape-rerun-13-transcript.txt`
- `evidence/evidence-hygiene-rerun-13.txt`

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home, build `26200`
- PowerShell: `5.1.26100.8655`
- USB drive letter on the scratch machine: `D:`
- Install root: `C:\BellField`
- Scratch machine LAN IP: `192.168.50.131`
- Active adapter/profile at baseline: Wi-Fi on `Blackbox 5`, network category
  `Public`
- Baseline showed no BellField services installed.

## What Passed

- USB hash verification passed before extraction.
- Artifact `.23` extracted to `C:\BellField` with `tar.exe`.
- Packaged baseline collection completed and wrote JSON evidence.
- Packaged `write-server-config.mjs` completed without exposing generated
  secrets.
- The LAN helper reached the intended Public-profile fail-closed branch.
- After explicit trusted-LAN consent, the LAN helper changed Wi-Fi from
  `Public` to `Private`.
- The LAN helper created the expected BellField-managed firewall rules:
  - `BellField-Office-Web-TCP-Inbound` for TCP `3000`
  - `BellField-API-TCP-Inbound` for TCP `3001`
  - both scoped to `Private,Domain` and `LocalSubnet`
  - PostgreSQL/`5432` was not opened
- The LAN helper wrote non-localhost LAN config:
  - `NEXT_PUBLIC_API_BASE_URL=http://192.168.50.131:3001`
  - `BELLFIELD_OFFICE_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.50.131:3000`
- Packaged PostgreSQL provisioning completed.
- Packaged migrations completed.
- Valid license was copied to
  `C:\BellField\data\license\bellfield-license.json`.
- Service manifests rendered.
- Elevated `install-windows-services.ps1` exited `0`.
- The installer confirmed:
  - `bellfield-postgres` SCM `StartName` as
    `NT SERVICE\bellfield-postgres`
  - runtime config valid with relay disabled
  - license config/readability valid
  - all four services reached `Running`
  - all four service process IDs stayed stable through the settle window
  - API `/health` reached `ok`
- Packaged service evidence collector completed and wrote redacted evidence.
- Elevated service/ACL readback passed for env, service manifests, PostgreSQL
  release/data/log paths, and expected service identities.
- Local API health returned `status: "ok"`.
- Packaged first-owner token helper copied the latest setup token without
  printing it into evidence.
- Browser first-owner setup completed using the documented disposable Gate Day
  owner credential.
- Browser office-work proof completed:
  - customer: `Gate Day Customer R13`
  - service location: `Gate Day Shop R13`
  - job: `Job 1003`
  - summary: `Gate Day R13 install proof - no heat test job`
  - status: `Scheduled`
  - next appointment window: `10:00 AM - 12:00 PM`
  - assigned: `Unassigned`
- The required reboot completed.
- Post-reboot readback showed all four services auto-started and were running:
  - `bellfield-postgres`: `Running`, `NT SERVICE\bellfield-postgres`
  - `bellfield-api`: `Running`, `LocalSystem`
  - `bellfield-worker`: `Running`, `LocalSystem`
  - `bellfield-office-web`: `Running`, `LocalSystem`
- Post-reboot API health returned `status: "ok"`.
- Post-reboot browser login succeeded with the documented Gate Day owner
  credential.
- Post-reboot Jobs proof showed `Job 1003` persisted.
- Packaged LAN evidence collector completed and wrote JSON evidence.
- `lan-evidence-rerun-13.json` reported:
  - `status: "completed"`
  - `firewallReadbackScope: "bellfield-managed-rules"`
  - `effectiveLanAccess: true`
  - selected LAN IP `192.168.50.131`
  - exact BellField-managed office/API firewall rules effective for TCP
    `3000`/`3001`, profile `Domain, Private`, and remote address `LocalSubnet`
  - installed-PC local-origin checks to office and API returned HTTP `200`
    while correctly marking `provesRemoteReachability: false`
- Real second-device proof passed from an iPhone 14 Pro Max on the same Wi-Fi,
  with cellular disconnected/no carrier:
  - office URL: `http://192.168.50.131:3000`
  - API URL: `http://192.168.50.131:3001`
  - login succeeded and dashboard/office app loaded.

## What Failed

Gate 2 failed at the first backup/restore step: producing a fresh worker backup
set after browser-created data existed.

The documented command shape loaded `C:\BellField\bellfield-server.env` into the
elevated process and ran:

```powershell
C:\BellField\release\runtime\node\node.exe C:\BellField\release\apps\worker\dist\jobs\backup\run-backup-cli.js
```

The CLI exited `1`. Explicit stdout/stderr capture reported:

```text
pg_dump.exe failed: spawn pg_dump.exe ENOENT
Manual backup failed. errorMessage: pg_dump.exe failed: spawn pg_dump.exe ENOENT
```

The strict run correctly stopped before restore. Gates 2 through 5 are not
passed by this run.

## Root Cause Notes

The installed worker service had already produced an automatic backup set before
the browser-created owner/customer/job proof, and that backup set had the
expected shape. It was not usable for Gate 2 because it predated the marker data
that the restore drill needs to preserve/erase.

Code review after the run explains the manual CLI failure:

- `BackupService` can use `BELLFIELD_PG_DUMP_PATH`,
  `BELLFIELD_POSTGRES_BIN`, or a relative
  `process.cwd()\..\..\postgres\bin\pg_dump.exe` fallback.
- The worker Windows service runs with working directory
  `C:\BellField\release\apps\worker`, so the relative fallback can find
  `C:\BellField\release\postgres\bin\pg_dump.exe`.
- The documented manual backup CLI can be launched from another working
  directory, and the generated server env currently does not set
  `BELLFIELD_POSTGRES_BIN` or `BELLFIELD_PG_DUMP_PATH`.

That makes the documented Gate 2 manual backup path fragile. The fix should make
packaged PostgreSQL tools discoverable without relying on the caller's current
directory or an undocumented PATH tweak. The restore helper already derives its
default PostgreSQL bin path from the packaged release root; the backup CLI
should follow that module-relative pattern instead of using `process.cwd()`.

## Operator And Evidence Notes

- The developer-tooling PATH check worked, but `where.exe` misses produced noisy
  PowerShell `NativeCommandError` output for expected absent tools. The checklist
  should use a copyable command that treats misses as success.
- The first elevated LAN helper output wrapper returned exit code `1` with an
  empty output file. A transcript wrapper captured the intended Public-profile
  refusal. This is an evidence-capture rough edge, not a product failure.
- The installer transcript printed repeated `Invoke-RestMethod` errors while
  polling for API startup, then later reached `/health` and exited `0`. The
  recovered polling noise is confusing but was not a failure.
- The first-owner token helper copied the token to the Windows clipboard, but
  the Codex in-app browser clipboard did not see it. A transient bridge file was
  used and deleted. The setup token value was not recorded.
- Some customer/location form controls were usable in the browser but were not
  consistently discoverable by `getByLabel`; role/name locators worked. This is
  automation friction, not an install blocker.
- After reboot, Dispatch was not the clearest persistence proof even though the
  Jobs queue showed the scheduled job. Future runs should use Jobs as the Gate 1
  persistence proof unless Dispatch behavior is being investigated directly.
- Evidence hygiene removed NUL-byte artifacts and a zero-byte initial LAN helper
  output file. The final rerun-13 evidence scan found no unredacted setup token,
  database URL, private-key block, Postgres password env var, or nonblank relay
  token assignment. The transient setup-token bridge file was absent.

## Recommended Follow-Up

Gate 1 can now be treated as passed for the clean Windows entry-tier install and
LAN proof.

Before rerunning Gate 2:

1. Fix the packaged/manual backup path so `run-backup-cli.js` can always find
   packaged `pg_dump.exe` in a hardened install. Prefer module-relative
   resolution from the compiled worker backup module, with
   `BELLFIELD_POSTGRES_BIN` and `BELLFIELD_PG_DUMP_PATH` kept as explicit
   override knobs.
2. Add regression coverage using the real generated install env and packaged
   manual backup entrypoint from a foreign working directory so the release ZIP
   smoke cannot pass while the Gate 2 manual path is still cwd-dependent.
3. Use a copyable elevated, secret-safe packaged backup helper for Gate 2.
   Non-elevated shells cannot read the hardened server env file by design.
4. After the fix is merged and artifacts are rebuilt, rerun from a cleaned state
   or explicitly label any continuation as diagnostic. Do not count Gate 2 until
   a fresh post-browser-proof backup set is produced and restored.
