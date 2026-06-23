# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 11

This records the eleventh fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-11-2026-06-23.md`,
`evidence/command-log-rerun-11.txt`,
`evidence/install-baseline-rerun-11.json`,
`evidence/lan-config-set-private-rerun-11.txt`,
`evidence/install-windows-services-rerun-11.txt`,
`evidence/service-evidence-rerun-11.json`,
`evidence/acl-readback-elevated-rerun-11.txt`,
`evidence/copy-first-owner-token-rerun-11.txt`, and
`evidence/job-1003-detail-rerun-11.png`. This repo doc is the sanitized,
durable summary.

Status: **failed at Gate 1 LAN evidence collection before real second-device
proof**.

The active blocker in artifact `.21` is the packaged LAN evidence collector,
not USB integrity, artifact extraction, LAN configuration, firewall rule
creation, PostgreSQL provisioning, migrations, service identity, service
startup, API health, first-owner setup, browser job booking, or reboot recovery.
The run stopped before the actual second-device browser login because the
runbook requires packaged LAN evidence first and the collector timed out.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260623.21.zip`
  - version: `0.0.1-gateday.20260623.21`
  - release date: `2026-06-23`
  - source commit: `8154dc8`
  - SHA256:
    `A5F9B63BFEDEE553E50B53B09C741362039182F9C708D48D49381AE4B034E808`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260623.22.zip`
  - version: `0.0.1-gateday.20260623.22`
  - release date: `2026-06-23`
  - source commit: `8154dc8`
  - SHA256:
    `1F046B40A23C39230D645D248816A3113E844959927282EC3BEA8CA8AB86ABEC`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Raw Evidence Files

- `evidence/gate-day-rerun-11-2026-06-23.md`
- `evidence/command-log-rerun-11.txt`
- `evidence/install-baseline-rerun-11.json`
- `evidence/lan-config-initial-rerun-11.txt` (empty failed elevated capture)
- `evidence/lan-config-elevated-initial-rerun-11.txt` (empty failed elevated capture)
- `evidence/elevated-wrapper-smoke-rerun-11.txt`
- `evidence/lan-config-set-private-rerun-11.txt`
- `evidence/lan-config-set-private-transcript-rerun-11.txt`
- `evidence/install-windows-services-rerun-11.txt`
- `evidence/install-windows-services-transcript-rerun-11.txt`
- `evidence/service-evidence-rerun-11.json`
- `evidence/service-evidence-collector-output-rerun-11.txt`
- `evidence/service-evidence-collector-transcript-rerun-11.txt`
- `evidence/acl-readback-elevated-rerun-11.txt`
- `evidence/acl-readback-elevated-transcript-rerun-11.txt`
- `evidence/copy-first-owner-token-rerun-11.txt`
- `evidence/copy-first-owner-token-transcript-rerun-11.txt`
- `evidence/job-1003-detail-rerun-11.png`
- `evidence/lan-evidence-collector-stdout-rerun-11.txt` (empty)
- `evidence/lan-evidence-collector-stderr-rerun-11.txt`
- `build-evidence/preflight-checkoff-rerun-11-2026-06-23.md`

The USB was reinserted on the dev machine after the run. The packaged USB hash
verifier passed from the scratch machine before extraction and was captured with:

```text
status: ok
checked: 117
failed: 0
```

## Scratch Machine Baseline

- Machine: `NONNA`
- USB drive letter on the scratch machine: `D:`
- Install root: `C:\BellField`
- Scratch machine LAN IP: `192.168.50.131`
- Active adapter/profile during baseline: Wi-Fi on `Blackbox 5`, network
  category `Public`
- Baseline collector ran and reported no BellField install root before
  extraction.
- Developer-tool PATH check found no checked developer tooling on PATH.

## What Passed

- USB hash verification passed: `117` checked, `0` failed.
- Artifact `.21` extracted to `C:\BellField\release` with `tar.exe`.
- Packaged baseline collection completed and wrote JSON evidence.
- Packaged `write-server-config.mjs` completed and wrote
  `C:\BellField\bellfield-server.env` plus the initial `C:\BellField\data`
  folder structure.
- `write-server-config.mjs` did not create `PG_VERSION`, matching the expected
  pre-provisioning state.
- The LAN helper reached the intended Public-profile fail-closed branch.
- After explicit operator consent, the LAN helper changed Wi-Fi from `Public`
  to `Private`.
- The LAN helper created the expected BellField-managed firewall rules for TCP
  `3000` and `3001`, scoped to `Private,Domain` and `LocalSubnet`.
- The LAN helper wrote non-localhost LAN config:
  - `NEXT_PUBLIC_API_BASE_URL=http://192.168.50.131:3001`
  - `BELLFIELD_OFFICE_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.50.131:3000`
- Packaged PostgreSQL provisioning completed; `PG_VERSION` existed afterward.
- Packaged migrations completed successfully.
- Valid license was copied to `C:\BellField\data\license\bellfield-license.json`.
- Service manifests rendered.
- Elevated `install-windows-services.ps1` exited `0`.
- The installer confirmed:
  - `bellfield-postgres` SCM `StartName` as `NT SERVICE\bellfield-postgres`
  - runtime config valid with relay disabled
  - all four services reached `Running`
  - API `/health` reached `ok`
  - all services were stable through the installer settle window
- Independent service readback after settle showed:
  - `bellfield-postgres`: `Running`, `NT SERVICE\bellfield-postgres`, exit `0`
  - `bellfield-api`: `Running`, `LocalSystem`, exit `0`
  - `bellfield-worker`: `Running`, `LocalSystem`, exit `0`
  - `bellfield-office-web`: `Running`, `LocalSystem`, exit `0`
- Packaged service evidence collector completed and redacted evidence.
- Elevated ACL readback passed for env, service manifest, PostgreSQL release,
  PostgreSQL data, and PostgreSQL log paths.
- Packaged first-owner token helper copied exactly one setup token without
  printing it into evidence.
- Browser first-owner setup completed as `Gate Day Owner`.
- API health remained `ok` after owner setup.
- Browser office-work proof completed:
  - customer: `Gate Day Test Customer`
  - location: `Gate Day Residence`
  - job: `Job 1003`
  - problem summary: `Gate Day rerun 11 browser-created service job`
  - visible job detail status: `Scheduled`
  - next appointment window: `8:00 AM - 10:00 AM`
  - technician: `Unassigned`
  - appointments count: `1`
- Human-owned reboot completed.
- Post-reboot services came back automatically and API health returned `ok`.
- Post-reboot browser login passed and showed the authenticated Dispatch board
  for `Gate Day Owner`.

## What Failed

The packaged LAN evidence collector did not complete:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\BellField\release\tools\install\collect-windows-lan-evidence.ps1 -InstallRoot C:\BellField -OutputPath D:\BellField-GateDay-2026-06-20\evidence\lan-evidence-rerun-11.json
```

Observed result:

- no stdout from the collector;
- no `evidence/lan-evidence-rerun-11.json`;
- the first wrapper timed out after about two minutes and left the collector
  process running;
- the orphaned collector process was stopped;
- a direct stdout/stderr retry timed out after `300000` ms and was stopped;
- stderr contained only:

```text
Collector process timed out after 300000 ms and was stopped. PID=2656
```

A diagnostic read-only timing probe of the apparent collector path,
`Get-NetFirewallRule -Direction Inbound` plus associated filter reads for ports
`3000`/`3001`, also timed out after 60 seconds before returning output.

Because the packaged LAN evidence did not complete, the runbook-required real
second-device browser login was not attempted. Gates 2-5 were not run.

## Diagnosis

Rerun 11 proved the rerun-10 source fix in the configurator: the packaged LAN
helper now reads firewall address filters correctly enough to complete the
Public-profile consent path, create managed firewall rules, validate effective
rules, and write LAN-safe env URLs.

The new blocker is in `collect-windows-lan-evidence.ps1`. Its
`Get-FirewallReadback` function enumerates every inbound firewall rule, then
calls `Get-NetFirewallPortFilter`, `Get-NetFirewallAddressFilter`, and
`Get-NetFirewallApplicationFilter` for each rule before writing any evidence.
On the scratch machine, that NetSecurity enumeration/associated-filter path
took unbounded time or hung. The collector has no progress marker before that
work, no exact-name fast path for BellField-managed rules, and no per-substep
timeout/fallback, so the operator only saw a silent hang.

This is not proof that second-device LAN access failed. It is also not proof
that LAN access would have worked. The strict gate stopped before the real
second-device browser login because the packaged collector, which was required
as pre-second-device evidence, did not complete.

## Operator Hiccups And Complaints

| Category            | Severity         | Step                                | What happened                                                                                                                                                                                      | Follow-up                                                                                                                             |
| ------------------- | ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| evidence-bug        | blocker          | LAN evidence collector              | The collector hung before writing stdout or JSON. The apparent source path is broad NetSecurity inbound-rule enumeration plus associated filter reads.                                             | Patch the collector to read exact BellField rules first, bound the expensive broad scan, and write progress/fallback evidence.        |
| evidence-quality    | high             | LAN collector output                | No progress marker showed which collector substep was stuck.                                                                                                                                       | Add progress labels before network profile, IP, listeners, managed firewall rule, optional broad firewall scan, and local URL probes. |
| operator-output     | medium           | elevated LAN helper failure capture | Initial elevated helper attempts produced empty output files when failing; the successful consent run captured output through a transcript/tee pattern.                                            | Standardize the elevated helper wrapper or document transcript/tee capture for expected-failure branches.                             |
| operator-friction   | medium           | first-owner setup                   | Direct navigation to `http://localhost:3000/identity/setup/first-owner` returned 404; entering the API URL in the office sign-in page Server URL field exposed the Create owner account form.      | Clarify the runbook: the browser setup UI lives in the office auth shell, while `/identity/setup/first-owner` is the API endpoint.    |
| operator-friction   | medium           | token paste                         | The token helper copied to the Windows clipboard, but the Codex in-app browser automation clipboard could not paste from it.                                                                       | Treat this as Codex/browser environment friction; keep the helper from printing secrets by default.                                   |
| evidence-permission | low              | ACL readback                        | Non-elevated `icacls` hit Access denied on hardened PostgreSQL service manifest/log paths; elevated readback succeeded.                                                                            | Clarify that ACL evidence may need elevated read-only PowerShell after service hardening.                                             |
| UI-copy             | low              | appointment creation                | Appointment creation showed toast text `Follow-up added.`                                                                                                                                          | Consider changing the toast to appointment-specific language.                                                                         |
| UI-state            | low/needs triage | job list vs detail                  | The job detail showed `Scheduled`, appointment count `1`, and next appointment, while the Jobs queue still counted the job under `Unscheduled`; screenshot also showed a `Needs scheduling` badge. | Capture the exact queue/date filters on the next browser pass or add a targeted UI/data check before calling this a product bug.      |
| evidence-formatting | low              | command log                         | Some command-log snippets still had null-character display artifacts from nested PowerShell output.                                                                                                | Continue using explicit UTF-8 append/capture and avoid formatted-object transcript noise where JSON evidence exists.                  |

## Recommended Next Step

Patch the LAN evidence collector, then rebuild the next artifact pair and rerun
Gate 1 from a cleaned Windows state. The patch should:

- add an exact-name managed BellField firewall rule readback path using:
  - `Get-NetFirewallRule -Name BellField-Office-Web-TCP-Inbound`
  - `Get-NetFirewallRule -Name BellField-API-TCP-Inbound`
  - associated port/address filters only for those exact rules;
- compute `effectiveLanAccess` from that exact managed-rule readback;
- make the broad inbound firewall scan optional, bounded, and non-blocking;
- emit progress markers before each major collector step;
- write partial JSON evidence on failure instead of leaving no output;
- keep local-origin URL checks clearly marked as installed-PC diagnostics, not
  remote reachability proof;
- preserve PostgreSQL local-only behavior and never open or require evidence
  for port `5432`.

The next strict rerun should specifically prove:

- default Public-profile refusal remains clear and fail-closed;
- `-SetCurrentNetworkPrivate` proceeds only after explicit trusted-shop-LAN
  consent;
- managed firewall rules read back as effective by profile, protocol, port,
  and address filter;
- `NEXT_PUBLIC_API_BASE_URL` and `BELLFIELD_OFFICE_ORIGINS` are changed from
  localhost to the selected LAN host before service rendering;
- packaged LAN evidence JSON is written without hanging;
- real second-device browser login succeeds;
- then Gates 2-5 can proceed.
