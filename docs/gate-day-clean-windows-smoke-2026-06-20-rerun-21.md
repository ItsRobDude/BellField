# Gate Day Clean Windows Smoke - 2026-06-28 Rerun 21

## Verdict

Failed before BellField install logic.

The USB evidence for rerun 21 is present and parseable. Preflight hash
verification passed (`144 checked, 0 failed`) and the read-only baseline
collector passed. Gate 1 then stopped during the new managed release
preparation mode:

```text
tools\install\run-gate-day-admin.ps1 -Mode gate1-prepare-release
```

The elevated Gate Day runner requested UAC, received approval, launched its
elevated child, and failed during prepare preflight because the artifact ZIP
path resolved to:

```text
C:\WINDOWS\system32\artifacts\bellfield-v0.0.1-gateday.20260628.39.zip
```

That file does not exist. `C:\BellField\release` was never created, no
BellField services were registered, and Gate 2 through Gate 5 were not
attempted.

Interpretation: this is a Gate Day runner/docs/path-resolution failure, not a
BellField product install, restore, updater, PostgreSQL, or service failure.
The strict stop was correct because prepare-mode terminal success is required
before continuing.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-28`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-28`.
- Clean-install / Gate 1+2 artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260628.39.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260628.40.zip`.
- Source commit:
  `b4135ba`.
- Scratch-machine USB hash verification:
  `144 checked, 0 failed`.
- Preflight checkoff:
  `build-evidence\preflight-checkoff-rerun-21-2026-06-28.md`.

Primary USB evidence:

- `evidence\gate-day-2026-06-28-rerun-21.md`
- `evidence\command-log-rerun-21.txt`
- `evidence\install-baseline-rerun-21.json`
- `evidence\gate-day-admin-runner-rerun-21.jsonl`
- `evidence\gate-day-admin-runner-rerun-21.transcript.txt`
- `evidence\gate1-prepare-failure-readback-rerun-21.json`
- `evidence\final-machine-state-rerun-21.json`
- `evidence\evidence-hygiene-closeout-rerun-21.json`

The final evidence hygiene scan reported no parse failures, broken Markdown
fences, NUL bytes, stray control characters, or unredacted secret-looking
markers after the run's cleanup pass.

## Gate 1 Result

Gate 1 did not complete.

Passed before the stop:

- USB hash verification passed from the scratch machine.
- Baseline collection passed before install-root preparation.
- Baseline confirmed `C:\BellField` was absent, no BellField services existed,
  the USB was mounted as `D:\`, the machine was `NONNA`, Windows was Windows 11
  Home build 26200, and the active Wi-Fi profile was Private.
- The runner self-elevation lifecycle itself worked: the USB JSONL contains
  `uac-requested`, `uac-approved`, and elevated-child-started evidence.

Failed step:

- `gate1-prepare-release` resolved the documented relative artifact path from
  the elevated child process' working directory, which was `C:\WINDOWS\system32`.
- The runner failed with artifact-not-found before release publication.
- `C:\BellField\release` remained absent.

Final machine state:

- `C:\BellField`: exists.
- `C:\BellField\release`: absent.
- `C:\BellField\data`: exists.
- `C:\BellField\data\logs\gate-day`: exists.
- BellField services: none registered.
- Machine rebooted during run: no.

## Gates Not Attempted

- Gate 2 backup/restore: not attempted.
- Gate 3 installed update: not attempted.
- Gate 4 expired-window refusal: not attempted.
- Gate 5 relay send and customer acceptance: not attempted.

## What Went Wrong

The generated USB `START-HERE.txt` command passed a relative artifact ZIP path:

```powershell
-ArtifactZip .\artifacts\bellfield-v0.0.1-gateday.20260628.39.zip
```

The runner self-elevates with `Start-Process -Verb RunAs`. After elevation, the
child process did not inherit the USB working directory in a way the prepare
mode could rely on. The child resolved `.\artifacts\...` relative to
`C:\WINDOWS\system32`, so the preflight looked for the ZIP in the wrong place.

The current repo docs already show placeholder absolute USB paths such as
`<usb>\artifacts\<artifact-A>.zip`, but the actual USB `START-HERE.txt` used a
relative path. The runner also accepts that relative path and resolves it only
inside the elevated child, where the caller's working directory context is
already gone.

Secondary rough edges from the evidence:

- The prepare failure created `C:\BellField\data\logs\gate-day` before failing
  artifact preflight. That residue is harmless, but surprising for a
  prepare-mode artifact-not-found failure.
- Wrapper stdout/stderr was quiet. The actionable reason was clear in JSONL,
  but the operator had to inspect the runner log.
- Several evidence files were initially UTF-8 with BOM and had to be cleaned
  by the run's evidence hygiene pass. The final evidence is clean, but the
  writers/parsers should be made less fussy.

## Recommended Fixes

1. Resolve path inputs before self-elevation.
   `run-gate-day-admin.ps1` should convert relative path parameters such as
   `-ArtifactZip`, `-EvidenceRoot`, `-ReleaseRoot`, `-UpdateArtifactRoot`, and
   `-BackupSet` into absolute paths in the non-elevated parent context before
   constructing the elevated child argument list. At minimum, `-ArtifactZip`
   must be absolutized before launch.

2. Generate `START-HERE.txt` with absolute artifact variables.
   The USB instructions should set:

   ```powershell
   $ArtifactA = Join-Path $UsbRoot 'artifacts\bellfield-v0.0.1-gateday.20260628.39.zip'
   $ArtifactB = Join-Path $UsbRoot 'artifacts\bellfield-v0.0.1-gateday.20260628.40.zip'
   ```

   and pass `$ArtifactA` / `$ArtifactB` to the prepare modes instead of
   `.\artifacts\...`.

3. Print concise fixed-mode preflight failures to wrapper stdout/stderr.
   The JSONL should remain the source of truth, but artifact-not-found should
   also be visible at the console.

4. Move prepare-mode artifact existence checks before local install-root
   scaffolding where practical.
   If the artifact path is bad, strict Gate Day should ideally leave no
   `C:\BellField` residue beyond USB-side failure evidence.

5. Standardize generated evidence encoding.
   Use UTF-8 without BOM for helper sidecars/transcripts where practical, or
   explicitly document and tolerate BOMs in evidence hygiene tooling.

## Required Follow-Up Before Another Strict Gate

Do not rerun the strict clean-machine path with the rerun-21 USB instructions.
They will fail the same way unless the operator manually substitutes absolute
artifact paths.

The repo-side follow-up now absolutizes runner path inputs before
self-elevation, prints concise fixed-mode failures to stderr, and tightens USB
preflight/checkoff instructions so strict `START-HERE.txt` commands use
`$UsbRoot`-anchored artifact variables. The next strict Gate Day attempt still
requires a freshly prepared USB and a clean or intentionally reset machine.
Because this run stopped before install logic, it does not invalidate the prior
Gate 1/Gate 2 product proofs or the Gate 3 service-asset/ACL fixes waiting for a
real update rerun.
