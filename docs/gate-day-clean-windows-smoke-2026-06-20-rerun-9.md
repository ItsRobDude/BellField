# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 9

This records the ninth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-9-2026-06-21.md`,
`evidence/command-log-rerun-9.txt`,
`evidence/install-baseline-rerun-9.json`, and
`evidence/lan-config-rerun-9-default-transcript.txt`. This repo doc is the
sanitized, durable summary.

Status: **failed at Gate 1 LAN access helper before PostgreSQL provisioning**.

The active blocker in artifact `.17` is a packaged helper bug, not USB integrity,
artifact extraction, developer-tool contamination, relay config, PostgreSQL
service identity, service startup, first-owner setup, or second-device product
behavior. The run stopped before PostgreSQL was initialized and before services
were rendered or installed.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260621.17.zip`
  - version: `0.0.1-gateday.20260621.17`
  - release date: `2026-06-21`
  - source commit: `991d773`
  - SHA256:
    `4F7A3E946B67436D63FDC64840796F83653F913DCEE7FD2845069A53069AA0DD`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260621.18.zip`
  - version: `0.0.1-gateday.20260621.18`
  - release date: `2026-06-21`
  - source commit: `991d773`
  - SHA256:
    `7A3C470689AF522E89A62CD9C84D0F09804DE6443F46438698989FC29367C364`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Raw Evidence Files

- `evidence/gate-day-rerun-9-2026-06-21.md`
- `evidence/command-log-rerun-9.txt`
- `evidence/install-baseline-rerun-9.json`
- `evidence/lan-config-rerun-9-default.txt` (empty first wrapper capture)
- `evidence/lan-config-rerun-9-default-transcript.txt`
- `evidence/next-codex-rerun-9-handoff.md`

The USB was reinserted on the dev machine after the run. The packaged USB hash
verifier passed from `I:\BellField-GateDay-2026-06-20` with:

```text
status: ok
checked: 114
failed: 0
```

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- PowerShell: Windows PowerShell `5.1.26100.8655`
- USB drive letter on the scratch machine: `D:`
- Install root: `C:\BellField`
- Scratch machine LAN IP during baseline: `192.168.50.131`
- Active adapter/profile during baseline: Wi-Fi on `Blackbox 5`, network
  category `Public`
- Developer-tool PATH check after stop found no `node.exe`, `git.exe`,
  `pnpm.cmd`, `psql.exe`, `docker.exe`, or `code.cmd`.

## What Passed

- USB hash verification passed: `114` checked, `0` failed.
- Artifact `.17` extracted to `C:\BellField\release` with `tar.exe`.
- Packaged baseline collection completed and wrote JSON evidence.
- Packaged `write-server-config.mjs` completed and wrote
  `C:\BellField\bellfield-server.env`.
- Clean env key-state readback matched the intended relay-disabled model:
  - `BELLFIELD_RELAY_SERVER_INSTANCE_ID` present and non-empty.
  - `BELLFIELD_RELAY_BASE_URL` blank.
  - `BELLFIELD_RELAY_TOKEN` blank.
  - `DATABASE_URL` present and non-empty; value redacted from evidence.

## What Failed

Gate 1 failed at the required LAN helper step:

```powershell
C:\BellField\release\tools\install\configure-windows-lan-access.ps1 -InstallRoot C:\BellField
```

The helper ran elevated but exited `1` before reaching the documented
Public-profile refusal/confirmation branch. The captured transcript shows:

```text
Read-ServerEnvValue : Cannot bind argument to parameter 'Lines' because it is an empty string.
At C:\BellField\release\tools\install\configure-windows-lan-access.ps1:316 char:49
```

Because this helper is now a required packaged install step before PostgreSQL
provisioning and service rendering, the run correctly stopped.

## Stop State

- `C:\BellField\release` was extracted.
- `C:\BellField\bellfield-server.env` and the initial `C:\BellField\data`
  structure were created by `write-server-config.mjs`.
- PostgreSQL provisioning was not run.
- Migrations were not run.
- The license file was not copied into `C:\BellField\data\license`.
- Windows service manifests were not rendered.
- No BellField services were registered or running.
- No BellField firewall rules were found.
- The current network profile remained `Wi-Fi: Public`.
- The machine was not rebooted.

## Diagnosis

The root cause is a PowerShell parameter-binding bug in
`configure-windows-lan-access.ps1`, not an env generation failure. The generated
`bellfield-server.env` intentionally contains blank separator lines. The helper
passed that line array into `Read-ServerEnvValue`, whose mandatory
`[string[]]$Lines` parameter rejected arrays containing empty strings before the
function body could inspect `DATABASE_URL`, `BELLFIELD_OFFICE_WEB_PORT`, or
`BELLFIELD_API_PORT`.

This explains why the helper failed before it could determine that the active
network profile was `Public` and before it could print the intended
`Set-NetConnectionProfile` guidance.

Follow-up source patch:

- allow blank env separator lines in the LAN helper env reader/writer functions;
- add a PowerShell install-helper smoke corpus that parses those real functions
  and feeds them generated-env-shaped lines with blanks;
- change the config helper's console message so it does not tell operators to
  record the generated database password separately.

Those source fixes still need a rebuilt artifact pair and USB hash refresh
before another strict clean-machine rerun.

## Operator Hiccups And Complaints

| Category        | Severity          | Step                 | What happened                                                                                                                                               | Follow-up                                                                                                     |
| --------------- | ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| installer-bug   | blocker           | LAN helper           | The required LAN helper crashed with a low-level parameter-binding error while reading the generated env.                                                   | Patch env reader/writer parameter binding, add a smoke that exercises blank env separator lines, rebuild USB. |
| operator-output | time-wasting      | LAN helper capture   | The first elevated wrapper returned exit code `1` but produced an empty capture file. A transcript wrapper was needed to preserve the error.                | Keep using transcript capture for elevated helper failures or teach the runbook a standard capture wrapper.   |
| runbook-UX      | confusing         | LAN helper           | The runbook promised actionable Public-profile guidance, but the crash happened before that branch.                                                         | After the code fix, rerun from clean state and confirm the default Public-profile failure message is useful.  |
| secret-hygiene  | confusing wording | Server config helper | `write-server-config.mjs` printed "Record the generated database password in the customer install notes," conflicting with the operator rules for evidence. | Reword the helper output to treat `bellfield-server.env` as the protected source of truth.                    |

## Recommended Next Step

Rebuild the next artifact pair with the LAN env-line fix and config-helper
wording fix, refresh USB hashes, and rerun Gate 1 from a cleaned Windows state.
The next run should specifically prove:

- the default LAN helper path reaches the intended Public-profile refusal on a
  Public network;
- `-SetCurrentNetworkPrivate` only proceeds after explicit trusted-shop-LAN
  operator consent;
- managed firewall rules are created and read back as effective for the active
  profile;
- the install continues through PostgreSQL provisioning, migrations, service
  install, API health, owner setup, job booking, reboot recovery, LAN evidence,
  and real second-device login.
