# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 8

This records the eighth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-8-2026-06-21.md` and
`evidence/command-log-rerun-8.txt`. This repo doc is the sanitized, durable
summary.

Status: **failed at Gate 1 second-device LAN proof**.

Rerun #8 had two distinct chapters:

1. The first strict preflight correctly stopped before extraction because the
   USB hash manifest included mutable current-run `evidence/**` files.
2. After the USB manifest was corrected on the dev machine without changing the
   product ZIPs, the same rerun continued from the corrected USB and got through
   install, service health, first-owner setup, job booking, reboot recovery, and
   post-reboot login. It then failed when two same-Wi-Fi devices timed out
   trying to reach the office app over the LAN.

The active blocker is now Windows LAN ingress/second-device reachability, not
release artifact integrity, PostgreSQL service identity, runtime config, API
health, first-owner setup, or reboot recovery.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260621.15.zip`
  - version: `0.0.1-gateday.20260621.15`
  - release date: `2026-06-21`
  - source commit: `07a97ed`
  - SHA256:
    `E4C1CC8277F84338E390C2F66AC437B9BDB5BEACFF5087BD1762B8E33B4273E6`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260621.16.zip`
  - version: `0.0.1-gateday.20260621.16`
  - release date: `2026-06-21`
  - source commit: `07a97ed`
  - SHA256:
    `9C6F3CDF96CF0BD5B91188D9A6D0DA27F06BCD6A77CE26702A1865A4D5871558`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Raw Evidence Files

- `evidence/gate-day-rerun-8-2026-06-21.md`
- `evidence/command-log-rerun-8.txt`
- `evidence/install-windows-services-rerun-8.txt`
- `evidence/service-evidence-rerun-8.json`
- `evidence/collect-windows-service-evidence-rerun-8.txt`
- `evidence/copy-first-owner-token-rerun-8.txt`
- `evidence/next-codex-rerun-8-handoff.md`

The USB was reinserted on the dev machine after the run. The packaged USB hash
verifier passed from `I:\BellField-GateDay-2026-06-20` with:

```text
status: ok
checked: 107
failed: 0
```

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- USB drive letter on the scratch machine: `D:`
- Install root: `C:\BellField`
- Scratch machine LAN IP during the second-device attempt: `192.168.50.131`
- Active adapter/profile during the second-device attempt: Wi-Fi on `Blackbox 5`,
  network category `Public`

## What Passed

- Corrected USB hash verification passed: `107` checked, `0` failed.
- Artifact `.15` extracted to `C:\BellField\release` with `tar.exe`.
- Packaged `write-server-config.mjs` wrote the clean server env.
- Clean env shape matched the intended relay-disabled model:
  - `BELLFIELD_RELAY_SERVER_INSTANCE_ID` present and non-empty.
  - `BELLFIELD_RELAY_BASE_URL` blank.
  - `BELLFIELD_RELAY_TOKEN` blank.
  - `BELLFIELD_LICENSE_REQUIRED=true`.
  - `BELLFIELD_LICENSE_PATH` pointed at
    `C:\BellField\data\license\bellfield-license.json`.
  - `DATABASE_URL` present and non-empty; value redacted from evidence.
- Packaged PostgreSQL provisioning completed.
- Packaged migrations completed:

  ```text
  Applied 74 migrations. Migrations are now up to date.
  ```

- The valid license was copied into the configured license path.
- Windows service manifests rendered.
- Elevated service install passed.
- Runtime config validation passed before service startup.
- The installer started services, confirmed service state/PID stability, and
  reached API `/health`.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- Packaged service evidence collection ran after install.
- All four BellField services were running before reboot.
- The packaged first-owner setup-token helper passed:
  - `status: ok`
  - `tokenLineCount: 1`
  - `copiedToClipboard: true`
  - `multipleTokenWarning: false`
- Browser first-owner setup completed as `Gate Day Owner`.
- Browser work proof completed:
  - customer: `Gate Day Rerun 8 Customer`
  - location: `Gate Day Shop`
  - job: `Job 1003`
- Human reboot completed.
- Post-reboot service recovery passed:
  - all four services running;
  - `bellfield-postgres` still read back as
    `NT SERVICE\bellfield-postgres`;
  - API `/health` returned `status: ok`.
- Post-reboot browser login passed:
  - `http://localhost:3000` loaded;
  - the sign-in screen appeared;
  - login with the gate-test owner succeeded;
  - Dispatch loaded as `Gate Day Owner`.
- Local LAN self-checks from the installed PC passed:
  - `http://192.168.50.131:3000` returned HTTP 200 locally.
  - `http://192.168.50.131:3001/health` returned `status: ok` locally.

## What Failed

Gate 1 failed at the required second-device LAN proof.

Human report:

- Tried `http://192.168.50.131:3000` from two separate devices.
- Both devices were on the same Wi-Fi network.
- Both attempts timed out.

Read-only diagnostics from the installed PC:

- Installed PC LAN IP: `192.168.50.131` on Wi-Fi.
- Network category: `Public`.
- BellField listeners were present:
  - office web on `0.0.0.0:3000`;
  - API on `:::3001`.
- Installed PC could reach the office app and API health endpoint through its
  own LAN IP.
- Firewall rule search found no obvious BellField/Node/3000/3001 inbound allow
  rule.

No Windows Firewall rule was added and the network profile was not changed
during the strict gate. That was the right gate discipline: adding an
undocumented workaround would have hidden the missing install/runbook step.

## Diagnosis

The strongest evidence points to an inbound Windows LAN reachability gap. The
application stack was listening and healthy on the installed PC, including
through its LAN IP, but other same-Wi-Fi devices could not connect. The scratch
machine was on a `Public` Windows network profile, and the run found no explicit
BellField/Node/3000/3001 inbound allow rule.

The installer and runbook currently prove localhost health but do not create,
verify, or document the Windows Firewall/network-profile path required for a
second office desktop to reach the office web service over the LAN. That is now
the active Gate 1 product/install gap.

## Operator Hiccups And Complaints

| Category        | Severity                      | Step                                   | What happened                                                                                                                                                                                    | Follow-up                                                                                                                                          |
| --------------- | ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| usb-prep        | corrected before continuation | Initial hash verification              | The first preflight failed because `SHA256SUMS.txt` included mutable current-run `evidence/**` files that `START-HERE.txt` told the operator to edit.                                            | Keep current-run evidence excluded from package hashes. The corrected USB passed `107` checks with `0` failures.                                   |
| command-process | annoying                      | Baseline capture                       | A baseline block included PowerShell formatting-object noise before a cleaner baseline was captured.                                                                                             | Prefer explicit `Select-Object` output or JSON for evidence snippets.                                                                              |
| command-process | time-wasting                  | Temporary PostgreSQL/migration wrapper | A Codex command wrapper timed out around temporary PostgreSQL/migrations; the temporary Postgres process had to be stopped, then migrations were rerun with safer log-file readback.             | Keep using `pg_ctl -l <logfile>` and separate log readback. Avoid piping `pg_ctl start` through `Tee-Object`.                                      |
| operator-flow   | papercut                      | First-owner token                      | The helper copied the latest token to the Windows clipboard, but Codex/browser automation could not read that clipboard directly, so the token had to be bridged carefully without recording it. | Keep the helper; document that visible human browser paste is the normal path. Do not print tokens unless explicitly using a diagnostic-only flag. |
| evidence-safety | important                     | Service evidence collector             | The collector included an API log tail containing a first-owner setup-token line before active evidence was redacted.                                                                            | Patch the collector to redact setup-token lines from service log tails before writing evidence. Do not rely on manual cleanup.                     |
| UX/readout      | minor                         | Dispatch after job creation            | Dispatch showed `0 appointments` immediately after job creation while the Jobs queue/detail showed `Job 1003` and its appointment window.                                                        | Clarify expected Dispatch criteria or improve the post-create operator readout if unscheduled/unassigned jobs are intentionally absent.            |
| diagnostics     | expected friction             | Ad hoc ACL readback                    | Some ad hoc ACL reads hit access-denied behavior after hardening, while the packaged elevated collector succeeded.                                                                               | Keep directing operators to the packaged elevated collector for one-path-at-a-time ACL evidence.                                                   |
| gate-discipline | good                          | Second-device failure                  | The run stopped at second-device timeout instead of changing firewall/profile settings mid-gate.                                                                                                 | Keep this discipline. Next pass should test a documented installer/runbook firewall path.                                                          |

## Recommended Next Step

Patch the install/runbook path for LAN reachability before another full Gate 1
rerun. The preferred product direction is to make the installer create and read
back narrowly scoped inbound Windows Firewall allow rules for the configured
office-web and API ports, then have the runbook capture:

- network profile;
- listener readback;
- local LAN-IP office/API health from the installed PC;
- firewall rule readback;
- external second-device access.

If the product decision is not to automate firewall rules yet, the runbook must
still document the operator-owned firewall/network-profile preparation as an
explicit prerequisite. Leaving it implicit will keep wasting clean-machine
cycles.

Also patch `collect-windows-service-evidence.ps1` so setup-token log lines are
redacted before evidence is written.

Gate 1 remains open only on the LAN/second-device portion. Gates 2-5 were not
run because Gate 1 failed and the operator rules require stopping after a failed
gate check.
