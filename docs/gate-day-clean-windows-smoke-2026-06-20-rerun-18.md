# Gate Day Clean Windows Smoke - 2026-06-27 Rerun 18

## Verdict

Failed at Gate 3 update.

Gate 1 and Gate 2 both passed again on the clean Windows machine from the
authorized `.33`/`.34` USB rebuild. Gate 3 did not pass: the updater process
started from artifact `.34`, returned exit code `1`, changed the installed
release to `.34`, preserved a rollback release and pre-update backup, but left
all four BellField services stopped with API health down. The captured updater
evidence contained no `BELLFIELD_UPDATE_PHASE`, `BELLFIELD_UPDATE_RESULT`, or
`BELLFIELD_UPDATE_FAILURE` lines.

Do not mark the installed updater gate complete from this run. Gate 4
expired-window refusal and Gate 5 relay/customer-acceptance proof were not
attempted because the strict run stopped at Gate 3.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-27`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-27`.
- Clean-install / restore artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260627.33.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260627.34.zip`.
- Source commit:
  `2582d79`.
- Artifact number note: `.33` and `.34` were intentionally reused because a
  prior USB refresh with those numbers was not authorized and does not count.
- Scratch-machine hash verification before extraction:
  `134 checked, 0 failed`.
- Active `.33` ZIP hash:
  `9D87D180951849A35147D78DE0B7B0619775DFA808619361BDF1AB05891C1B0C`.
- Active `.34` ZIP hash:
  `7FC77D95AF8CF404A1E3089F480878F465E0250B69AC6247A0D4E228790DCC67`.

Primary USB evidence:

- `evidence\gate-day-2026-06-27-rerun-18.md`
- `evidence\command-log.txt`
- `evidence\install-baseline-rerun-18.json`
- `evidence\service-evidence-rerun-18.json`
- `evidence\lan-evidence-rerun-18.json`
- `evidence\backup-helper-rerun-18.txt`
- `evidence\restore-helper-rerun-18.txt`
- `evidence\update-rerun-18.txt`
- `evidence\update-rerun-18-corrected.txt`

Final evidence hygiene passed after the operator-readable evidence file was
polished: no NUL bytes, no stray control characters, Markdown fences balanced,
JSON sidecars parsed, and no obvious unredacted secret-looking values found.

## Gate 1 Result

Gate 1 passed.

The clean install completed the expected entry-tier Windows path:

- USB hashes passed from the scratch machine.
- Artifact `.33` extracted with Windows `tar.exe`.
- Baseline collection, server config generation, LAN config, PostgreSQL
  provisioning, packaged migrations, license placement, service manifest
  rendering, and service installation all passed.
- All four Windows services were Running:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- Runtime config validation, service stability, and API `/health` passed.
- First-owner setup completed through the browser.
- Browser proof created a customer, service location, job, and appointment.
- Reboot recovery passed; services returned and API `/health` returned `ok`.
- Packaged LAN evidence passed with `effectiveLanAccess: true`.
- A real second device on the same LAN opened the office app, signed in, and
  loaded the office shell.

Gate 1 rough edges:

- The baseline collector lives inside the extracted release, while the operator
  prose still says to capture a baseline before mutating the machine. The
  practical sequence was extract first, then baseline before config,
  provisioning, service, and data mutations.
- The LAN helper succeeded, but the first wrapper capture was too quiet. A
  concise success summary should include selected IP, active profile, URL keys
  changed, and firewall rules created/read back.
- The Codex process PATH exposed a bundled `pnpm.cmd`, while persistent Windows
  User and Machine PATH were clean. The operator rules should distinguish
  Codex-injected process PATH entries from persistent machine contamination.
- Browser automation clipboard isolation made first-owner setup-token handoff
  awkward. The run did not print or save the token, but the handoff should be
  documented or made safer in the helper/UI path.
- Customer billing address and service-location creation remain easy to
  confuse during job intake.
- After job creation, the UI returned to Customers search instead of opening
  the new job.
- The appointment card showed `Unscheduled` while the job status was
  `Scheduled` and a time window was visible.

## Gate 2 Result

Gate 2 passed.

- Packaged backup helper created:
  `C:\BellField\data\backups\bellfield-backup-20260628-001644Z-d1972821`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- The backup-set license hash matched the installed license hash.
- A post-backup marker job was created after the backup:
  `Job 1004 / AFTER-BACKUP-MARKER-rerun-18`.
- Restore completed through the packaged helper with exit code `0`.
- Restore reset and recreated the public schema, ran `pg_restore`, and found
  migrations up to date.
- Restore preserved rollback copies for the previous media root and license
  file.
- Restore printed:
  `BellField restore data, media, license, and migrations completed.`
- Service readiness initially failed, the helper retried service start once,
  `/health` reached `ok`, and restore completed.
- Post-restore service readback showed all four services Running.
- Browser proof after restore showed login worked, pre-backup `Job 1003`
  survived, post-backup marker `Job 1004` was gone, and the jobs queue showed
  one active job.

Interpretation: the backup/restore lane remains closed. Rerun 18 reconfirmed
the owned-schema restore path, marker rollback, service-readiness retry, and
license restore behavior on the clean Windows machine.

Gate 2 rough edge:

- The restore readiness retry works, but the first readiness-failure message
  still looks alarming before the retry succeeds. It should read more clearly
  as an in-progress recovery step.

## Gate 3 Result

Gate 3 failed during the real `.33` to `.34` installed update.

The update artifact extracted correctly to:

```text
C:\BellField-update-rerun-18-34\release
```

The intended updater command was:

```powershell
.\runtime\node\node.exe .\tools\install\update-bellfield.mjs --install-root=C:\BellField --current-release-root=C:\BellField\release --confirm=UPDATE
```

There were two updater launch attempts:

1. The first elevated capture wrapper failed before starting the updater because
   the wrapper did not resolve the relative packaged Node path from the working
   directory. A follow-up process check found no updater/artifact process
   running, services remained Running, and health remained `ok`. This was a
   capture-wrapper launch error, not a product updater execution.
2. The corrected wrapper used absolute packaged Node/updater paths and started
   the updater process as PID `18876`. The wrapper returned exit code `1`.
   Captured structured updater lines were all absent: no phase, result, or
   failure line.

Final stop-state readback after the corrected updater exit:

- No updater/artifact process was running.
- `C:\BellField\release` contained installed `.34` release files.
- `C:\BellField\release.restore-rollback-20260628-005347Z` preserved the
  previous release.
- `C:\BellField\data\backups\bellfield-backup-20260628-005400Z-51c2bcd5`
  preserved a fresh pre-update backup.
- All four BellField services were Stopped:
  `bellfield-api`, `bellfield-office-web`, `bellfield-postgres`, and
  `bellfield-worker`.
- `bellfield-postgres` still had SCM `StartName`
  `NT SERVICE\bellfield-postgres`.
- API `/health` failed to connect.

Interpretation: rerun 18 proves the single-updater lock/stage-reservation work
prevented the rerun 17 overlap failure, but it did not close Gate 3. The update
made it past at least the release swap and pre-update backup, then exited
without captured structured terminal evidence and without restarting services.

The exact internal failing phase cannot be reconstructed from the USB evidence
alone because the corrected wrapper captured no updater stdout/stderr beyond
the PID line. Treat this as both:

- a real Gate 3 updater failure, because the installed machine was left on
  `.34` with all services stopped; and
- an updater evidence durability failure, because the operator evidence did not
  retain the phase/failure summary needed to diagnose the exact path.

## Gates Not Attempted

- Gate 4 expired-window refusal: not attempted because Gate 3 failed/stopped.
- Gate 5 relay send and acceptance: not attempted because Gate 3 failed/stopped.
  Relay token material was also not included on this unencrypted USB.

## Required Follow-Up

1. Add durable updater logging under the install root before the next Gate 3
   rerun. The updater should write phase, result, and failure JSONL to a file
   such as `C:\BellField\data\logs\update\...` in addition to stdout.
2. Add a top-level fatal/uncaught failure path for `update-bellfield.mjs` so an
   unexpected exception before or outside the normal recovery catch still
   creates a durable failure record.
3. Make the Gate 3 elevated capture recipe use absolute executable/script
   paths and explicit stdout/stderr capture while still showing the
   customer-facing relative command in evidence.
4. Investigate why `.34` was swapped in and all services were left stopped
   without captured structured updater evidence. Start from post-swap
   start/migration/health/recovery paths, since the final state proves the
   release swap and pre-update backup had completed.
5. Keep the strict rule: after any unclear updater capture or nonzero updater
   exit, do not retry Gate 3 until process state, release/rollback state,
   backup state, service state, and health are recorded.
6. Keep Gate 4 and Gate 5 unclaimed until Gate 3 passes from one clean update
   attempt with durable phase/result/failure evidence.

## Repo Follow-Up Status

The backup/restore lane remains passed. Gate 3 remains open.

The next implementation slice should be narrow: durable updater evidence first,
then a focused fix for the actual post-swap service/recovery failure once the
updater can prove its own failing phase.
