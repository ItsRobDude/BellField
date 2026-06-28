# Gate Day Clean Windows Smoke - 2026-06-28 Rerun 19

## Verdict

Failed at Gate 3 update.

Gate 1 and Gate 2 both passed again on the clean Windows machine from the
`.35`/`.36` USB built from source commit `d586b99`. Gate 3 moved forward from
the rerun 18 evidence-loss problem: the updater produced durable JSONL under
`C:\BellField\data\logs\update`, copied to the USB as
`gate3-durable-update-20260628-180410Z-rerun-19.jsonl`, and that log names the
failing phase.

The real updater failure was:

```text
BELLFIELD_UPDATE_FAILURE phase=startingPostgres
Failed to start Windows service bellfield-postgres
```

The release swap completed first. The installed `C:\BellField\release` was the
attempted `.36` release, the previous `.35` release was preserved as a rollback
directory, a pre-update backup was preserved, and all four BellField services
were left stopped as the post-swap recovery policy says.

Gate 4 expired-window refusal and Gate 5 relay/customer-acceptance proof were
not attempted because the strict run stopped at Gate 3.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-28`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-28`.
- Clean-install / restore artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260628.35.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260628.36.zip`.
- Source commit:
  `d586b99`.
- Artifact `.35` build manifest:
  `build-evidence\bellfield-v0.0.1-gateday.20260628.35-build-manifest.json`.
- Artifact `.36` build manifest:
  `build-evidence\bellfield-v0.0.1-gateday.20260628.36-build-manifest.json`.
- Scratch-machine USB hash verification:
  `140 checked, 0 failed`.

Primary USB evidence:

- `evidence\gate-day-2026-06-28-rerun-19.md`
- `evidence\command-log.txt`
- `evidence\install-baseline-rerun-19.json`
- `evidence\service-evidence-rerun-19.json`
- `evidence\lan-evidence-rerun-19.json`
- `evidence\gate2-backup-set-shape-rerun-19.json`
- `evidence\gate2-restore-command-rerun-19.txt`
- `evidence\gate3-update-command-rerun-19.txt`
- `evidence\gate3-durable-update-20260628-180410Z-rerun-19.jsonl`
- `evidence\gate3-update-evidence-command-rerun-19.txt`

The final evidence hygiene scan passed after the Gate 3 stop documentation and
durable JSONL copy. The scan included JSONL line parsing and reported no NUL
bytes, stray control characters, broken Markdown fences, invalid JSON sidecars,
invalid JSONL lines, or obvious unredacted secret-looking markers.

## Gate 1 Result

Gate 1 passed.

The clean install completed the expected Windows path:

- USB hashes passed from the scratch machine.
- Artifact `.35` extracted with Windows `tar.exe`.
- Baseline collection, server config generation, LAN config, PostgreSQL
  provisioning, packaged migrations, license placement, service manifest
  rendering, and service installation all passed.
- All four Windows services were Running:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- ACL readback passed after an elevated retry.
- API `/health` returned `ok`.
- First-owner setup, browser customer/location/job proof, reboot recovery, and
  post-reboot login passed.
- Packaged LAN evidence passed.
- Real second-device same-Wi-Fi login passed from an iPhone 14 Pro Max.

Gate 1 rough edges:

- UAC prompts were missed/canceled during separate elevated evidence steps.
  Those events were operator-attention misses, not product failures, but they
  made the run noisy and slow. The runner-first Gate Day work added after this
  tested commit is meant to reduce this prompt storm.
- Non-elevated ACL reads hit hardened-path access denial; elevated readback was
  required before the run could treat ACL evidence as complete.

## Gate 2 Result

Gate 2 passed.

- Packaged backup helper eventually completed through a visible elevated
  runner after earlier UAC/capture trouble.
- The selected backup set was:
  `C:\BellField\data\backups\bellfield-backup-20260628-155736Z-d02c32da`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- A post-backup browser marker job was created after the backup:
  `AFTER-BACKUP-MARKER RERUN 19`.
- Restore completed through the packaged helper with exit code `0`.
- Post-restore `/health` returned `ok` on the first bounded retry attempt.
- Browser proof after restore showed the marker erased and the original
  pre-backup job/customer/location preserved.
- Installed license SHA-256 matched the backup-set license and the USB valid
  license.
- Post-restore service readback showed all four services Running, with
  PostgreSQL still under `NT SERVICE\bellfield-postgres`.

Interpretation: the backup/restore lane remains closed. Rerun 19 reconfirmed
the real worker backup, owned-schema restore, marker rollback, license restore,
service restart, login, and pre-backup data preservation on the clean Windows
machine.

## Gate 3 Result

Gate 3 failed during the real `.35` to `.36` installed update.

The update artifact extracted correctly to:

```text
C:\BellField-update-rerun19-36
```

The updater command used absolute packaged paths and returned exit code `1`:

```powershell
C:\BellField-update-rerun19-36\release\runtime\node\node.exe `
  C:\BellField-update-rerun19-36\release\tools\install\update-bellfield.mjs `
  --install-root=C:\BellField `
  --current-release-root=C:\BellField\release `
  --confirm=UPDATE
```

Durable update JSONL sequence:

- `verifying` at `2026-06-28T18:04:10.651Z`
- `staging` at `2026-06-28T18:15:38.529Z`
- `backupComplete` with pre-update backup:
  `C:\BellField\data\backups\bellfield-backup-20260628-181559Z-3c2be4bb`
- `servicesStopped`
- `processesExited`
- `swappingRelease`
- `releaseSwapped` with rollback release:
  `C:\BellField\release.restore-rollback-20260628-181538Z`
- `startingPostgres`
- terminal `BELLFIELD_UPDATE_FAILURE`

The terminal failure:

```text
Failed to start Windows service bellfield-postgres:
Start-Service : Service 'BellField PostgreSQL (bellfield-postgres)' cannot be started
```

Final Gate 3 state according to the durable updater failure JSONL and closeout
notes:

- Current release root:
  `.36` attempted release.
- Rollback release directory:
  `C:\BellField\release.restore-rollback-20260628-181538Z`.
- Pre-update backup:
  `C:\BellField\data\backups\bellfield-backup-20260628-181559Z-3c2be4bb`.
- `bellfield-postgres`: Stopped.
- `bellfield-api`: Stopped.
- `bellfield-worker`: Stopped.
- `bellfield-office-web`: Stopped.
- Release-root process evidence:
  no matching release-root processes and no unavailable-command-line processes
  in the failure summary.

Interpretation: durable updater logging did its job. Rerun 19 proves the
release swap no longer fails from PostgreSQL holding the live release tree, but
the update still does not pass because PostgreSQL cannot be started from the
new swapped release. The next code investigation should focus on the
post-swap `bellfield-postgres` start path, service wrapper/log evidence, ACLs,
service binary path, and PostgreSQL runtime/data compatibility after the swap.

## Evidence Collector Failure

The packaged read-only update evidence collector also failed after the updater
failure:

```text
collect-windows-update-evidence.ps1:159
Argument types do not match
lastWriteTimeUtc = ConvertTo-IsoUtcString $latestLog.LastWriteTimeUtc
```

No `gate3-update-evidence-rerun-19.json` was produced. The durable update JSONL
was copied manually to USB evidence and parsed successfully. That JSONL is the
source of truth for the updater failure.

Interpretation: this is a separate evidence tooling bug, not the product
updater root cause. The collector must handle `FileInfo.LastWriteTimeUtc` type
conversion correctly and should still produce read-only evidence when an
update has failed.

## Gates Not Attempted

- Gate 4 expired-window refusal: not attempted because Gate 3 failed/stopped.
- Gate 5 relay send and acceptance: not attempted because Gate 3 failed/stopped.

## Required Follow-Up

1. Rebuild fresh artifacts from current `main` and rerun Gate 3 with the
   runner-first flow. Gate 3 is still unclaimed until a clean installed
   v(N) → v(N+1) update passes or produces a new terminal durable failure event.
2. Keep using the durable updater JSONL as the source of truth after nonzero
   update exits. If a collector fails, copy the durable JSONL and record its
   terminal event before any retry or recovery attempt.
3. Keep Gate 4 and Gate 5 unclaimed until Gate 3 passes from one clean update
   attempt with a terminal durable update event.
4. Use the runner-first Gate Day flow for the next attempt so missed UAC prompts
   and per-helper elevated wrapper capture do not keep polluting product
   evidence.

## Repo Follow-Up Status

This run was from commit `d586b99`, before the later Gate Day runner-first docs,
dry-run guardrails, and Gate 3 service-asset/ACL follow-up. After this run,
PR #81 landed the direct code hardening that came out of the evidence:

- generated service wrappers/XML are prepared in the staged release before the
  destructive update boundary;
- staged service ACLs are applied before swap and fail closed when critical
  PostgreSQL service assets are missing;
- the failed-update collector handles the timestamp conversion path and returns
  fail-soft PostgreSQL start evidence.

The current repo therefore no longer treats missing staged service assets, ACL
drift, or the collector timestamp conversion as unpatched code follow-ups. It
still does not claim Gate 3 closed until fresh artifacts prove the installed
update path on the clean Windows machine.
