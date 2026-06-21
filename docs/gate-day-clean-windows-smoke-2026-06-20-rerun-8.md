# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 8

This records the eighth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-8-2026-06-21.md` and
`evidence/command-log-rerun-8.txt`. This repo doc is the sanitized, durable
summary.

Status: **blocked before extraction by USB hash manifest policy**.

Rerun #8 did not reach BellField extraction or service installation. The active
product artifact hashes were correct, but `SHA256SUMS.txt` also included the
current run's mutable evidence files. `START-HERE.txt` told the operator to
write those files, so strict hash verification failed before the install could
begin.

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

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- USB drive letter on the scratch machine: `D:`
- `C:\BellField` was not touched during this attempt.
- No BellField services were installed, changed, or started.
- No reboot happened.

## What Passed

- The operator followed the gate discipline and stopped at the first blocking
  pre-extraction command.
- The product artifact hash entries for `.15` and `.16` matched:
  - `.15`: `ok`
  - `.16`: `ok`
- The run generated useful evidence without contaminating `C:\BellField`.

## What Failed

The first blocking command was:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install\verify-usb-hashes.ps1 -Root .
```

The verifier exited `1` with:

```text
status: failed
checked: 107
failed: 2
```

The two failing paths were mutable current-run evidence files:

- `evidence/command-log-rerun-8.txt`
- `evidence/gate-day-rerun-8-2026-06-21.md`

Both files had changed because `START-HERE.txt` instructed the operator to write
the active rerun notes and command output there. Including those files in the
strict package-integrity manifest made the USB check fail for the wrong reason.

No install, provisioning, migration, service, first-owner, job-booking, reboot,
restore, update, expired-license, or relay gate was attempted.

## Diagnosis

This was a USB preparation/process defect, not an application artifact defect.

`SHA256SUMS.txt` should cover immutable package inputs: product artifacts,
offline docs, build evidence, helper scripts, licenses, and the top-level
operator instructions. It should not cover current-run evidence under
`evidence/**`, because those files are intentionally edited during the run.

The current-run evidence directory is still important, but it is not package
integrity material. If a strict verifier reports only `evidence/**` mismatches,
that is a USB manifest bug to correct before rerunning; it is not proof that the
product ZIPs were corrupted.

## USB Correction Applied

After the USB was returned to the dev machine:

- `START-HERE.txt` was updated to say current-run evidence under `evidence\`
  is mutable and intentionally excluded from `SHA256SUMS.txt`.
- `SHA256SUMS.txt` was regenerated excluding:
  - `evidence/**`
  - `private-relay-config/**`
- `build-evidence/rerun-8-usb-manifest-correction.txt` was added.
- Product artifacts `.15` and `.16` were not changed.
- The packaged verifier was rerun from the USB root and passed:

```text
status: ok
checked: 106
failed: 0
```

The corrected manifest contains zero `evidence/**` entries.

## Operator Hiccups And Complaints

| Category        | Severity | Step                 | What happened                                                                                                     | Follow-up                                                                                                                       |
| --------------- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| usb-prep        | blocking | Hash verification    | `SHA256SUMS.txt` included mutable current-run evidence files, so the first pre-extraction verifier failed.        | Exclude `evidence/**` from USB package hashes. Keep evidence files readable, but do not treat them as immutable package inputs. |
| instructions    | blocking | `START-HERE.txt`     | The instructions told the operator to write the evidence files that were also hashed.                             | Say evidence logs are mutable and intentionally excluded from `SHA256SUMS.txt`.                                                 |
| gate-discipline | good     | Stop before install  | The run stopped before extraction instead of bypassing the verifier or hand-editing files on the scratch machine. | Keep this discipline. A bad package-integrity precheck is still a stop condition.                                               |
| artifact proof  | good     | Product ZIP readback | `.15` and `.16` product ZIP hashes were `ok` in the failed verifier output.                                       | No rebuild is required for this specific failure.                                                                               |

## Recommended Next Step

Use the corrected USB and rerun Gate 1 from a cleaned Windows state.

No product rebuild is required solely for rerun #8's failure because the
clean-install and update ZIP hashes matched and no install state was touched.
The next run should still begin with the same strict package hash verification;
the corrected manifest now verifies immutable package files without treating
active evidence logs as corruption.

Gate 1 remains open until a clean-machine run proves:

- first-owner setup completes;
- browser job booking works;
- services survive reboot;
- second-device access works;
- backup/update/expired-license/relay gates are attempted only after the base
  install gate succeeds.
