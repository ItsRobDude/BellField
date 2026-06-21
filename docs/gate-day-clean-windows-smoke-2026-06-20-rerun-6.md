# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 6

This records the sixth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-6-2026-06-21.md`,
`evidence/command-log-rerun-6.txt`, and
`evidence/tmp-rerun-6/`. This repo doc is the sanitized, durable summary.

Status: **failed at required post-install service readback**.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260621.11.zip`
  - version: `0.0.1-gateday.20260621.11`
  - release date: `2026-06-21`
  - source commit: `2a1af80`
  - SHA256:
    `A58C36F183394CFE0EC503EDB1681A8BEC6F8C652DA42DC83D5980E57587594E`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260621.12.zip`
  - version: `0.0.1-gateday.20260621.12`
  - release date: `2026-06-21`
  - source commit: `2a1af80`
  - SHA256:
    `51A434233A66E679F653DAFD5A7E2FD2E61B43B8A8F9FCFE830BB42FF65E65C8`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- USB drive letter on the scratch machine: `D:`
- Gate start: `2026-06-21T08:19:26.6192059-07:00`
- `C:\BellField` was absent before extraction
- No pre-existing BellField services were present
- No disallowed developer tooling was found on `PATH` for:
  `node`, `git`, `psql`, `pnpm`, `npm`, `docker`, or `code`
- Required USB docs were read:
  `START-HERE.txt`, `docs\codex-install-test-operator-rules.md`,
  `docs\gate-day-checklist.md`, `docs\install-runbook.md`, and
  `docs\restore-runbook.md`

## What Passed

Run #6 reached farther than run #5 and proved the fixed installer can apply the
PostgreSQL service identity on the clean Windows machine.

- Active artifact hashes matched `SHA256SUMS.txt`.
- Artifact `.11` extracted to `C:\BellField` using Windows built-in tooling.
- Required packaged runtime/tooling files were present after extraction.
- `write-server-config.mjs` completed and created the server env file plus local
  data directories without printing secret values.
- `provision-postgres.mjs` completed.
- Packaged migrations ran from the extracted release tree and completed.
- Temporary PostgreSQL was stopped after migrations.
- The valid license was copied to
  `C:\BellField\data\license\bellfield-license.json`; hash readback was
  captured.
- `render-windows-services.mjs` completed and produced the expected service
  manifests.
- `install-windows-services.ps1` completed under elevation.
- The installer output confirmed:

  ```text
  bellfield-postgres SCM StartName confirmed as NT SERVICE\bellfield-postgres.
  BellField services installed and started.
  ```

- Immediate service readback showed `bellfield-postgres`, `bellfield-api`, and
  `bellfield-office-web` running. `bellfield-worker` was already stopped.
- Elevated stop evidence shortly afterward showed:
  - `bellfield-postgres`: `Running`, `StartName`
    `NT SERVICE\bellfield-postgres`, `ExitCode 0`
  - `bellfield-office-web`: `Running`, `ExitCode 0`
  - `bellfield-api`: `Stopped`, `ExitCode 1067`
  - `bellfield-worker`: `Stopped`, `ExitCode 1067`
- Elevated ACL readbacks showed the intended PostgreSQL service-account shape:
  - `C:\BellField\bellfield-server.env`: `SYSTEM` and `Administrators` only
  - `C:\BellField\release\services`: narrow
    `NT SERVICE\bellfield-postgres:(RX)` plus `SYSTEM` and `Administrators`
  - `bellfield-postgres.xml`: narrow service-account read plus `SYSTEM` and
    `Administrators`
  - `C:\BellField\release\postgres`: service-account read/execute access
  - `C:\BellField\data\postgres`: service-account full control
  - `C:\BellField\data\logs\services\bellfield-postgres`: service-account full
    control

## What Failed

The required post-install service readback failed after the elevated installer
returned success. The first readback stopped the run because
`bellfield-worker` was `Stopped`; final readback showed both `bellfield-api`
and `bellfield-worker` stopped with service `ExitCode 1067`.

The API error log reported:

```text
BellField API cannot start: 1 configuration problem(s) found.
  - BELLFIELD_RELAY_BASE_URL, BELLFIELD_RELAY_TOKEN, and BELLFIELD_RELAY_SERVER_INSTANCE_ID must all be set together (or all left empty).
See .env.example for the required production settings.
```

The worker log reported the same relay configuration problem. Elevated env
presence readback captured only booleans, not values:

```text
Name                               Present NonEmpty
----                               ------- --------
BELLFIELD_RELAY_BASE_URL              True    False
BELLFIELD_RELAY_TOKEN                 True    False
BELLFIELD_RELAY_SERVER_INSTANCE_ID    True     True
```

No browser setup, health check, job booking, reboot, second-device, restore,
update, expired-license refusal, or relay gate was attempted after this stop
condition.

Recent Service Control Manager evidence showed this was already a real restart
loop, not a one-time delayed stop: `bellfield-api` had terminated unexpectedly
27 times and `bellfield-worker` 19 times in the captured event window.

## Diagnosis

Run #6 closes the previous PostgreSQL service-account uncertainty for the
current clean-machine path. The installed service read back as
`NT SERVICE\bellfield-postgres`, PostgreSQL stayed running, and the ACL
readbacks matched the intended narrow service-account model.

The new blocker is the clean-install relay config contract:

- `bellfield-server.env.example` says all three relay values must be set
  together or all left empty.
- `write-server-config.mjs` replaces
  `BELLFIELD_RELAY_SERVER_INSTANCE_ID=GENERATED_SERVER_INSTANCE_ID` with a real
  non-empty UUID during normal clean install.
- The USB docs tell the operator not to copy relay base URL/token until the
  relay gate, and to preserve the generated server instance ID.
- The production API runtime correctly sees that as a partial relay triplet:
  base URL empty, token empty, server instance ID non-empty.

That means the documented clean Gate 1 install cannot start API/worker before
the relay gate. This is not a leaked-token problem and not an operator mistake;
the operator followed the current docs.

There are two legitimate fix directions. Choose one deliberately in code and
docs, then rebuild:

1. Make Gate 1 truly leave all three relay keys empty until relay activation,
   generating/storing the server instance ID only when relay is enabled.
2. Keep the generated server instance ID at install time, but change runtime
   relay config so an instance ID by itself still means "relay disabled" until
   base URL and token are non-empty.

The second path keeps the per-machine ID available for later activation without
forcing relay credentials into the base clean install. Whichever path is chosen,
add a runtime/config test so a generated instance ID with empty base URL/token
does not regress unnoticed if that is the accepted disabled-relay state.

Follow-up implementation selected the second path: base URL plus token activate
relay, while a generated server instance ID by itself remains a disabled-relay
clean-install state. The artifact proof still has to come from a rebuilt ZIP,
USB hash refresh, and a fresh clean Windows rerun.

## Operator Hiccups And Complaints

These are not the root cause, but they should feed the next runbook pass.

| Category            | Severity | Step                         | What happened                                                                                                                                                               | Follow-up                                                                                                                                                                             |
| ------------------- | -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| config-contract     | blocking | API/worker startup           | Clean install generated a non-empty `BELLFIELD_RELAY_SERVER_INSTANCE_ID` while relay base URL/token remained empty, so API/worker refused to start.                         | Fix the relay-disabled config contract in code/docs before the next artifact. Do not manually paste relay credentials or blank generated values as a Gate 1 workaround.               |
| installer-ux        | medium   | Service installation         | `install-windows-services.ps1` printed "installed and started" even though API/worker entered a crash/restart loop immediately afterward.                                   | Keep the separate service readback mandatory. Consider making the installer wait briefly after startup and fail if any auto BellField service is stopped or has a non-zero exit code. |
| evidence-permission | minor    | Post-hardening log capture   | Non-elevated evidence capture could not read `C:\BellField\bellfield-server.env` or service log directories after ACL hardening.                                            | Document that post-service log/evidence capture may require an elevated read-only PowerShell session or a packaged log collector.                                                     |
| automation-hiccup   | minor    | Temporary PostgreSQL startup | The first manual `pg_ctl start` was captured through a PowerShell pipeline despite the runbook warning. The command timed out after PostgreSQL was ready.                   | Keep using `pg_ctl -l <logfile>` and read the log separately; do not pipe-capture a background PostgreSQL start.                                                                      |
| evidence-hiccup     | minor    | ACL readback                 | The first stop-evidence attempt grouped multiple `icacls` paths in one command and received an invalid-parameter response. Individual elevated `icacls` calls corrected it. | Keep the checklist examples as individual `icacls` commands, and capture each path separately.                                                                                        |
| gate-discipline     | good     | Stop decision                | The run stopped at the required service readback and did not manually edit env values to push farther.                                                                      | Keep this discipline. A manual env edit after the failure would be diagnostic only, not a clean Gate 1 pass.                                                                          |

## Recommended Fix

1. Fix the clean-install relay config contract:
   - either defer generating/writing `BELLFIELD_RELAY_SERVER_INSTANCE_ID` until
     relay activation;
   - or let production runtime treat a generated instance ID with empty base
     URL/token as relay disabled.
2. Add or adjust API runtime config tests for the chosen disabled-relay shape.
3. Update `write-server-config.mjs`, `bellfield-server.env.example`, and USB
   docs so they tell the same story.
4. Add a post-start stabilization/readback check to the service install path or
   make the runbook command mandatory enough that no one trusts the installer
   success line alone.
5. Add an elevated read-only log/evidence capture helper or copyable wrapper for
   post-ACL service logs.
6. Rebuild the next artifact pair, refresh USB hashes, and rerun Gate 1 from a
   cleaned scratch machine.

Do not treat artifacts `.11`/`.12` as passed install artifacts. They proved the
PostgreSQL service identity and ACL path, but the documented clean install still
fails before first-owner setup.

## Result

Gate 1 remains open. Rerun #6 proved:

- the `.11`/`.12` artifact hashes and extraction path were sound;
- packaged PostgreSQL provisioning and migrations still work on the clean
  machine;
- the installer now configures and reads back the PostgreSQL SCM account as
  `NT SERVICE\bellfield-postgres`;
- PostgreSQL starts and remains running under that account;
- PostgreSQL service-account ACLs match the intended narrow model.

Rerun #6 did not prove:

- API/worker startup from the clean relay-disabled server config;
- first-owner setup;
- `/health`;
- browser job booking;
- reboot/service recovery;
- second-device access;
- backup/restore;
- update/refusal;
- relay send/acceptance.

Gates 2 through 5 were not reached.
