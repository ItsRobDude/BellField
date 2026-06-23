# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 12

This records the twelfth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-12-2026-06-23.md`,
`evidence/RERUN-12-READ-ME-FIRST.md`,
`evidence/command-log-rerun-12.txt`,
`evidence/install-baseline-rerun-12.json`,
`evidence/lan-config-rerun-12-first-rerun-capture.txt`,
`evidence/lan-config-rerun-12-set-private.txt`,
`evidence/install-services-rerun-12.txt`,
`evidence/service-evidence-rerun-12.json`,
`evidence/service-readback-rerun-12.txt`,
`evidence/acl-readback-rerun-12.txt`,
`evidence/first-owner-token-helper-rerun-12.txt`, and
`evidence/post-reboot-service-readback-rerun-12.txt`. This repo doc is the
sanitized, durable summary.

Status: **blocked at Gate 1 post-reboot browser login proof because the
first-owner password existed only in transient Codex/browser automation state
and was unavailable after reboot**.

This is not evidence that the installed services failed. The run proved service
installation, PostgreSQL service identity, local browser owner setup, job
booking, reboot recovery, service auto-start, and post-reboot API health on the
scratch machine. It stopped before packaged LAN evidence collection and before
real second-device browser login.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260623.23.zip`
  - version: `0.0.1-gateday.20260623.23`
  - release date: `2026-06-23`
  - source commit: `0a6d4ed`
  - SHA256:
    `6A40B347444BE6053841B43BB0280F0C037E2C9DD9AB7CAAF3A4E682737C621D`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260623.24.zip`
  - version: `0.0.1-gateday.20260623.24`
  - release date: `2026-06-23`
  - source commit: `0a6d4ed`
  - SHA256:
    `2E446CDBC0DBE15EF4D0311EC0A60EA43563A1979958D1F8A154F2C7E667CC87`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Raw Evidence Files

- `evidence/RERUN-12-READ-ME-FIRST.md`
- `evidence/gate-day-rerun-12-2026-06-23.md`
- `evidence/command-log-rerun-12.txt`
- `evidence/install-baseline-rerun-12.json`
- `evidence/lan-config-rerun-12-first.txt` (empty first elevated capture)
- `evidence/lan-config-rerun-12-first-rerun-capture.txt`
- `evidence/lan-config-rerun-12-set-private.txt`
- `evidence/install-services-rerun-12.txt`
- `evidence/service-evidence-rerun-12.json`
- `evidence/service-evidence-rerun-12.stdout.txt`
- `evidence/service-readback-rerun-12.txt`
- `evidence/acl-readback-rerun-12.ps1`
- `evidence/acl-readback-rerun-12.txt`
- `evidence/first-owner-token-helper-rerun-12.txt`
- `evidence/post-reboot-service-readback-rerun-12.txt`
- `evidence/evidence-hygiene-rerun-12.txt`
- `evidence/evidence-index-rerun-12.txt`
- `build-evidence/preflight-checkoff-rerun-12-2026-06-23.md`

The USB hash verifier passed from the scratch machine before extraction:

```text
status: ok
checked: 119
failed: 0
```

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home, build `26200`
- PowerShell: `5.1.26100.8655`
- USB drive letter on the scratch machine: `D:`
- Install root: `C:\BellField`
- Scratch machine LAN IP: `192.168.50.131`
- Active adapter/profile during baseline: Wi-Fi on `Blackbox 5`, network
  category `Public`
- Baseline collector ran after artifact extraction and before server config,
  PostgreSQL provisioning, LAN changes, or service installation.
- Baseline showed no BellField services installed.

## What Passed

- USB hash verification passed: `119` checked, `0` failed.
- Artifact `.23` extracted to `C:\BellField` with `tar.exe`.
- Packaged baseline collection completed and wrote JSON evidence.
- Packaged `write-server-config.mjs` completed and wrote
  `C:\BellField\bellfield-server.env`.
- The LAN helper reached the intended Public-profile fail-closed branch on
  Wi-Fi.
- After explicit operator consent, the LAN helper changed Wi-Fi from `Public`
  to `Private`.
- The LAN helper created the expected BellField-managed firewall rules for TCP
  `3000` and `3001`, scoped to `Private,Domain` and `LocalSubnet`.
- The LAN helper wrote non-localhost LAN config:
  - `NEXT_PUBLIC_API_BASE_URL=http://192.168.50.131:3001`
  - `BELLFIELD_OFFICE_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.50.131:3000`
- Packaged PostgreSQL provisioning completed.
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
- Packaged service evidence collector completed and wrote redacted evidence.
- Elevated ACL readback passed for env, service manifest, PostgreSQL release,
  PostgreSQL data, and PostgreSQL log paths.
- Local API health returned `status: "ok"`.
- Packaged first-owner token helper copied exactly one setup token without
  printing it into evidence.
- Browser first-owner setup completed and landed on Dispatch.
- Browser office-work proof completed:
  - owner: `Gate Day Rerun 12 Owner`
  - customer: `Gate Day Rerun 12 Customer`
  - service location: `Gate Day Service Site`
  - job: `Job 1003`
  - summary: `Gate Day Rerun 12 booked job`
  - scheduled date: `2026-06-23`
  - arrival window: `1:00 PM - 3:00 PM`
  - assigned: `Unassigned`
- The required reboot completed.
- Post-reboot readback showed all four services auto-started and were running
  with nonzero PIDs and exit code `0`.
- Post-reboot `bellfield-postgres` still read back as
  `NT SERVICE\bellfield-postgres`.
- Post-reboot API health returned `status: "ok"`.
- Office web loaded after reboot and showed the sign-in screen.
- Evidence hygiene scan found no obvious setup password, unredacted first-owner
  setup token, `DATABASE_URL`, relay token, or `PGPASSWORD` in top-level
  evidence files.

## What Blocked

The strict gate stopped at post-reboot office-web login proof.

The owner password created during first-owner setup was intentionally not
written to evidence or chat. It lived only in Codex/browser automation memory,
and that memory was not available after the required reboot. Continuing with
database edits, password reset workarounds, guessed credentials, or developer
tooling would have contaminated the strict gate.

The better forward fix is not a human pause. For disposable Gate Day
scratch-machine runs, use the documented fixed dummy credential
`gate.owner@example.com` / `BellFieldGateDay!2026` in the real first-owner setup
UI so Codex can reuse it after reboot. The dummy value is intentionally public
and non-production; real customer installs must choose their own owner password.

This means rerun 12 did not reach:

- packaged `collect-windows-lan-evidence.ps1` on the scratch machine;
- real second-device browser login;
- update gate;
- restore gate;
- sold-shaped relay gate.

## Operator And Evidence Notes

- The first elevated LAN helper no-flag capture returned exit code `1` with a
  zero-byte output file. A simpler elevated `cmd.exe` redirection captured the
  expected Public-profile refusal text. The helper behavior was correct once
  captured, but the evidence-capture wrapper was confusing.
- The Windows Service Control Manager install event for `bellfield-postgres`
  reported `LocalSystem`. Live `Win32_Service` and `sc qc` readbacks showed the
  corrected `NT SERVICE\bellfield-postgres` identity after installer SCM
  configuration. Treat live SCM readback as authoritative.
- The packaged first-owner token helper worked and copied one latest token to
  the Windows clipboard. Codex's in-app browser clipboard is isolated from the
  Windows clipboard, so automated paste needed a bridge. A Codex-only bridge
  initially decoded the token incorrectly, causing one invalid setup-token
  attempt; retrying with correct UTF-8 decoding succeeded. This appears to be
  an automation artifact, not a product helper failure.
- Creating a customer with a billing address did not automatically create an
  active service location for job intake. The operator had to use Add location
  before creating the job. This is workable but not obvious.
- The native job dispatch date field did not stick on the first Playwright
  `fill`; click/select/type/tab did work. This may be an automation artifact.
- After Create job, the app returned to Customers with a `Job created.` message
  instead of opening the new job. The operator had to navigate to Jobs and open
  Job 1003 manually to satisfy the create/book/open proof.

## Recommended Follow-Up

This is a runbook/operator-protocol blocker, not a code/runtime blocker based
on the available evidence.

Before rerun 13:

1. Amend the Gate 1 runbook and checklist so Codex uses the documented fixed
   dummy Gate Day credential in the real first-owner setup UI.
2. Do not rely on Codex/browser automation memory as the only copy of a newly
   invented password across a reboot.
3. Restart the strict gate from a cleaned Windows state, unless the continuation
   is explicitly labeled diagnostic.
4. After post-reboot login, run the packaged LAN evidence collector and then
   prove real second-device browser login. Rerun 12 did not validate those two
   remaining Gate 1 steps.
