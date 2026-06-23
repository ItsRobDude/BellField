# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 10

This records the tenth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-10-2026-06-22.md`,
`evidence/command-log-rerun-10.txt`,
`evidence/install-baseline-rerun-10.json`,
`evidence/configure-lan-rerun-10-transcript.txt`,
`evidence/configure-lan-rerun-10-set-private.txt`,
`evidence/configure-lan-rerun-10-final.txt`, and
`evidence/lan-helper-failure-readback-rerun-10.txt`. This repo doc is the
sanitized, durable summary.

Status: **failed at Gate 1 LAN helper effective-rule validation before
PostgreSQL provisioning**.

The active blocker in artifact `.19` is a packaged helper validation bug, not
USB integrity, artifact extraction, developer-tool contamination, server-config
generation, relay config, PostgreSQL provisioning, service identity, service
startup, first-owner setup, job booking, reboot recovery, or product
second-device behavior. The run stopped before PostgreSQL was initialized and
before services were rendered or installed.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260622.19.zip`
  - version: `0.0.1-gateday.20260622.19`
  - release date: `2026-06-22`
  - source commit: `31cd16c55a16e4025a041d23d9b8f34d6cb58231`
  - SHA256:
    `0476E872C8C27B5E3C2A747739735C0C837E3FA718A877E000BFF222E1632D2E`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260622.20.zip`
  - version: `0.0.1-gateday.20260622.20`
  - release date: `2026-06-22`
  - source commit: `31cd16c55a16e4025a041d23d9b8f34d6cb58231`
  - SHA256:
    `DA5CC7EEC6C3409EBF97F48A848940B23AC546F5D952D7F52C16B9839097720F`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

The `.19` and `.20` product ZIPs intentionally remained source commit
`31cd16c` after the later docs-only USB checklist correction. The corrected USB
docs and checkoff were copied separately and hash-verified.

## Raw Evidence Files

- `evidence/gate-day-rerun-10-2026-06-22.md`
- `evidence/command-log-rerun-10.txt`
- `evidence/install-baseline-rerun-10.json`
- `evidence/configure-lan-rerun-10.txt` (empty first elevated capture)
- `evidence/configure-lan-rerun-10-transcript.txt`
- `evidence/configure-lan-rerun-10-set-private.txt`
- `evidence/configure-lan-rerun-10-final.txt`
- `evidence/lan-helper-failure-readback-rerun-10.txt`
- `build-evidence/preflight-checkoff-rerun-10-2026-06-22.md`

The USB was reinserted on the dev machine after the run. The packaged USB hash
verifier passed from `I:\BellField-GateDay-2026-06-20` with:

```text
status: ok
checked: 117
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
- Baseline collector ran non-elevated by design and reported no BellField
  services installed before provisioning.
- Developer-tool PATH check after extraction found no `node.exe`, `git.exe`,
  `pnpm.cmd`, `psql.exe`, `docker.exe`, or `code.cmd`.

## What Passed

- USB hash verification passed: `117` checked, `0` failed.
- Artifact `.19` extracted to `C:\BellField\release` with `tar.exe`.
- Packaged baseline collection completed and wrote JSON evidence.
- Packaged `write-server-config.mjs` completed and wrote
  `C:\BellField\bellfield-server.env` plus the initial `C:\BellField\data`
  folder structure.
- `write-server-config.mjs` did not create `PG_VERSION`, matching the expected
  pre-provisioning state.
- The LAN helper no longer crashed on generated env blank separator lines. It
  reached the intended Public-profile refusal branch.
- The Public-profile refusal was useful: it named interface `Wi-Fi` index `2`,
  explained the Private/Domain-only policy, and printed a copyable
  `Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private`
  command.
- After explicit operator consent, the helper changed Wi-Fi from `Public` to
  `Private`.
- BellField-managed firewall rules were created with the expected exact names:
  - `BellField-Office-Web-TCP-Inbound`
  - `BellField-API-TCP-Inbound`
- Firewall readback showed the expected TCP ports and LocalSubnet scope:
  - office web: TCP `3000`, profile `Domain, Private`, remote address
    `LocalSubnet`
  - API: TCP `3001`, profile `Domain, Private`, remote address `LocalSubnet`

## What Failed

After the operator-approved `-SetCurrentNetworkPrivate` path, the required LAN
helper still exited `1`:

```text
BellField LAN firewall rules were created but are not effective for the active 'Private' profile and configured office/API ports.
```

Because the helper failed before completing, the install stopped before
PostgreSQL provisioning, migrations, license copy, service rendering, service
installation, API health, first-owner setup, job booking, reboot recovery, LAN
evidence collection, second-device login, update, or expired-window refusal.

The stop-state readback showed:

- `C:\BellField\release` exists.
- `C:\BellField\bellfield-server.env` exists.
- `C:\BellField\data\postgres\PG_VERSION` does not exist.
- No BellField services are installed.
- Wi-Fi profile is now `Private` after the consented helper run.
- The BellField firewall rules exist and read back with the intended ports,
  profiles, and `LocalSubnet` address filters.
- Non-secret LAN env keys still read:
  - `BELLFIELD_OFFICE_ORIGINS=http://localhost:3000`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`

## Diagnosis

The blank-env-line fix worked. Rerun 10 reached the intended Public-profile
refusal/consent branch that rerun 9 could not reach.

The new blocker is in firewall effectiveness validation. In
`configure-windows-lan-access.ps1`, `Test-ManagedRuleEffective` reads
`RemoteAddress` from the object returned by `Get-NetFirewallPortFilter`. Windows
NetSecurity exposes protocol/local-port state through
`Get-NetFirewallPortFilter`, but address scope comes from
`Get-NetFirewallAddressFilter`. The raw evidence proves the address filters were
actually correct:

```text
InstanceID    : BellField-Office-Web-TCP-Inbound
LocalAddress  : Any
RemoteAddress : LocalSubnet

InstanceID    : BellField-API-TCP-Inbound
LocalAddress  : Any
RemoteAddress : LocalSubnet
```

So the helper appears to be rejecting good firewall rules because it checks the
wrong filter object. Since the env update happens after
`Assert-BellFieldLanAccessEffective`, the false-negative also explains why
`BELLFIELD_OFFICE_ORIGINS` and `NEXT_PUBLIC_API_BASE_URL` remained on localhost.

`collect-windows-lan-evidence.ps1` has the same assumption in its firewall
readback path: it records `remoteAddress` from the port filter. If left
unchanged, the collector can misreport `effectiveLanAccess` even after the
configurator is fixed.

This is still not evidence about browser/product second-device behavior. The
run stopped before the office web and API services existed, so no remote device
could test the product yet.

## Operator Hiccups And Complaints

| Category        | Severity     | Step                  | What happened                                                                                                                                                    | Follow-up                                                                                                                       |
| --------------- | ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| installer-bug   | blocker      | LAN helper validation | The helper created the intended firewall rules but then failed its own effectiveness check because it appears to validate `RemoteAddress` from the wrong object. | Patch configurator validation to use `Get-NetFirewallAddressFilter`, and rebuild artifacts before another strict rerun.         |
| evidence-bug    | high         | LAN collector         | The read-only LAN collector appears to share the same port-filter/remote-address assumption.                                                                     | Patch collector readback/effective access logic with the configurator fix.                                                      |
| smoke-gap       | high         | install helpers smoke | Static checks proved strings such as `RemoteAddress` and `LocalSubnet`, but did not prove the NetSecurity filter object model.                                   | Add behavioral or stronger static smoke coverage that requires address-filter readback and forbids `$portFilter.RemoteAddress`. |
| operator-output | time-wasting | elevated capture      | The first elevated LAN helper launch returned exit code `1` with an empty capture file; a transcript wrapper was needed to preserve the Public-profile refusal.  | Standardize a transcript/try-catch wrapper for elevated helper failures in the runbook or package a helper runner.              |
| operator-output | minor        | command log           | The command log contained UTF-16/null-character display artifacts after nested PowerShell hash output; later appends used explicit UTF-8 encoding.               | Keep using explicit UTF-8 append/capture for scratch-machine command logs.                                                      |
| diagnostics     | minor        | LAN helper failure    | The final validation error did not print which predicate failed.                                                                                                 | Emit per-rule diagnostics for enabled/action/direction/profile/protocol/port/remote-address predicates on validation failure.   |

## Recommended Next Step

Patch the LAN helper bundle, then rebuild the next artifact pair and rerun Gate
1 from a cleaned Windows state. The patch should:

- change `configure-windows-lan-access.ps1` to validate remote address through
  `Get-NetFirewallAddressFilter`, not the port filter;
- change `collect-windows-lan-evidence.ps1` to capture and evaluate address
  filters the same way;
- improve the helper failure message with per-rule predicate readback so an
  operator can tell whether profile, protocol, local port, or remote address
  failed;
- extend `pnpm smoke:install-helpers` so it proves address-filter handling, not
  only string presence;
- keep PostgreSQL closed and local-only; do not open `5432`;
- rebuild active `.21`/`.22`-style artifacts, refresh USB hashes, and start the
  next run from a cleaned Windows state.

The next strict rerun should specifically prove:

- default Public-profile refusal remains clear and fail-closed;
- `-SetCurrentNetworkPrivate` proceeds only after explicit trusted-shop-LAN
  consent;
- managed firewall rules read back as effective for the active Private profile;
- `NEXT_PUBLIC_API_BASE_URL` and `BELLFIELD_OFFICE_ORIGINS` are changed from
  localhost to the selected LAN host before service rendering;
- PostgreSQL provisioning, migrations, license placement, service install,
  API health, first-owner setup, job booking, reboot recovery, LAN evidence,
  and real second-device login all complete before moving to update and
  expired-window gates.
