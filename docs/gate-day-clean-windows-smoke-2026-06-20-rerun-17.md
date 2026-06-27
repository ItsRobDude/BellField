# Gate Day Clean Windows Smoke - 2026-06-27 Rerun 17

## Verdict

Failed at Gate 3 update.

This run is not a clean failure of the Postgres-stop update fix. It exposed a
different updater safety gap: overlapping elevated updater attempts were allowed
to run at the same time, which made the strict Gate 3 result invalid.

What the run proved:

- USB hash verification passed from the returned stick: `130 checked, 0 failed`.
- Gate 1 passed again from artifact `.31`.
- Gate 2 backup and restore passed again from a real worker-produced backup set.
- Restore readiness handling behaved correctly: the first `/health` probe missed,
  service start was retried, `/health` reached `ok`, and restore completed.
- Gate 3 did not pass. The updater/capture flow allowed overlapping attempts,
  one attempt failed in staging with `ENOTEMPTY`, and the final closeout state
  showed `.32` swapped in with all BellField services stopped.

Do not mark the installed updater gate complete from this run. Gate 4 expired
update-window refusal and Gate 5 relay/customer-acceptance proof were not
attempted because the strict run stopped at the Gate 3 failure.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-26`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-26`.
- Clean-install / restore artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260626.31.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260626.32.zip`.
- Source commit:
  `233e061`.
- Scratch-machine hash verification before extraction:
  `130 checked, 0 failed`.
- Returned USB hash verification on the review machine:
  `130 checked, 0 failed`.

Primary USB evidence:

- `evidence\gate-day-2026-06-26-rerun-17.md`
- `evidence\command-log.txt`
- `evidence\install-baseline-rerun-17.json`
- `evidence\service-evidence-rerun-17.json`
- `evidence\lan-evidence-rerun-17.json`
- `evidence\update-rerun-17.stdout.txt`
- `evidence\update-rerun-17.stderr.txt`
- `evidence\update-rerun-17.result.json`
- `evidence\gate3-timeout-state-rerun-17.json`
- `evidence\gate3-final-failure-state-rerun-17.json`
- `evidence\gate3-current-state-rerun-17.json`

Final evidence hygiene passed after the operator polished the Gate 3 chronology
for readability. JSON parse checks, Markdown fence checks, UTF-8 checks, and
secret-marker scans passed.

## Gate 1 Result

Gate 1 passed.

The first strict pre-extraction check stopped because `where.exe pnpm` found the
Codex runtime shim on the Codex process PATH. The operator corrected that as a
false positive: Windows User and Machine PATH were not contaminated, and no
BellField install work had begun. The run continued with sanitized child-command
PATH handling.

The clean install then completed the expected path:

- Artifact `.31` extracted with Windows `tar.exe`.
- Baseline collection, server config, LAN config, PostgreSQL provisioning,
  packaged migrations, license placement, service manifest rendering, and
  service installation all passed.
- All four Windows services were Running:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- First-owner setup completed through the browser.
- Browser proof created customer/location/job/appointment data.
- Reboot recovery passed; services returned and API `/health` returned `ok`.
- Post-reboot browser login and job proof passed.
- Packaged LAN evidence and second-device proof passed.

Gate 1 rough edges:

- A non-elevated ACL readback hit `Access is denied` on hardened PostgreSQL
  service paths. The packaged elevated service evidence already contained the
  ACL proof, but separate UAC prompts for follow-up evidence are still easy to
  miss or cancel.
- The clean-machine preflight should distinguish Windows User/Machine PATH from
  Codex-injected process PATH entries.

## Gate 2 Result

Gate 2 passed.

- Packaged backup helper created:
  `C:\BellField\data\backups\bellfield-backup-20260627-134148Z-c7783374`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- A post-backup marker job was created after the backup:
  `Job 1004 / AFTER-BACKUP-MARKER`.
- Restore completed through the packaged helper with exit code `0`.
- Restore printed:
  `BellField restore data, media, license, and migrations completed.`
- The first post-restore readiness probe failed with `fetch failed`; the helper
  retried service start once, health reached `ok`, and restore completed.
- Post-restore service readback passed with all four services Running.
- Browser/operator proof after restore showed:
  - login succeeded;
  - pre-backup job `1003` survived;
  - post-backup marker job `1004` was absent;
  - restored license file existed;
  - restored license SHA-256 matched the packaged license hash.

Interpretation: the restore readiness split added after rerun 16 worked as
intended. A readiness blip did not repaint the data restore as corrupted, and
the helper recovered service readiness before returning success.

Gate 2 rough edges:

- This particular manual proof had no media attachment to open after restore.
  The packaged release ZIP smoke still proves media rollback with byte
  comparisons, but the human runbook should either create a tiny media
  attachment before backup or explicitly mark media proof as root/packaged-smoke
  only for runs with no real attachment.
- The restore success path is now technically sound, but the readiness retry
  output is still a little noisy for an operator during a destructive restore.

## Gate 3 Result

Gate 3 failed during the real `.31` to `.32` installed update.

The update artifact extracted correctly to:

```text
C:\BellField\update-artifacts\artifact-b-rerun-17-20260627-065101\release
```

The intended updater command was:

```powershell
.\runtime\node\node.exe .\tools\install\update-bellfield.mjs --install-root=C:\BellField --current-release-root=C:\BellField\release --confirm=UPDATE
```

The failure was caused by updater overlap, not a clean singular update attempt:

- The first elevated capture wrapper returned/faulted without visible
  stdout/stderr/result evidence.
- A later timeout snapshot still showed services Running and health `ok`, so the
  operator treated the launch as a capture/elevation failure.
- Later evidence proved an elevated updater process had actually started.
- A retry then overlapped with the already-running updater.
- Structured updater output showed one attempt failing in phase `staging`.
- Failure:
  `ENOTEMPTY, Directory not empty: \\?\C:\BellField\release.restore-stage-20260627-141951Z`.
- The failure summary reported attempted version `.32`, installed version `.31`,
  and services still Running at that moment.
- The final closeout state superseded that moment-in-time snapshot: another
  overlapping updater had continued far enough to swap `C:\BellField\release`
  to `.32`.

Final closeout state:

- `C:\BellField\release` version:
  `0.0.1-gateday.20260626.32`.
- Rollback release directory:
  `C:\BellField\release.restore-rollback-20260627-141951Z`, version `.31`.
- Fresh pre-update backup exists:
  `C:\BellField\data\backups\bellfield-backup-20260627-142017Z-63474aa4`.
- `bellfield-postgres`: Stopped.
- `bellfield-api`: Stopped.
- `bellfield-worker`: Stopped.
- `bellfield-office-web`: Stopped.
- API `/health`: down / unable to connect.
- No updater processes remained at final readback.

Interpretation: rerun 17 invalidated the strict Gate 3 proof because multiple
updater attempts overlapped. The direct product problem is that the updater did
not enforce a single active update operation, and staging paths were
timestamp-to-the-second rather than protected against concurrent attempts. That
allowed two elevated updater processes to share destructive state.

This run therefore does not prove whether stopping `bellfield-postgres` fixes
the live release swap. That still needs a clean single-updater rerun after the
overlap guard lands.

## Required Follow-Up

1. Add a single active-update lock around `update-bellfield.mjs`. A second
   updater launch must fail immediately with a clear "update already running"
   message, including the owner PID/start time, before staging, backup, service
   stop, or release swap.
2. Make staged release directory creation race-safe. Same-stamp paths must be
   atomically reserved so concurrent or retried attempts cannot collide in
   `release.restore-stage-*`.
3. Keep the rerun 16/rerun 17 service-order fix: stop
   `bellfield-postgres` before release swap and start PostgreSQL before
   migrations.
4. Update the Gate 3 runbook: after any UAC/capture timeout, search for an
   already-running `update-bellfield`/artifact-node process before retrying.
5. Prefer a visible/live-output elevated runner for Gate 3 evidence. Hidden UAC
   wrappers with buffered stdout are too easy to misinterpret during destructive
   operations.
6. Keep the longer-term pointer/junction release layout on the roadmap. If a
   clean single-updater rerun still hits a live-directory lock after Postgres is
   stopped, do not keep extending lock-clearing tricks; change the install
   layout.
7. Keep Gate 4 and Gate 5 unclaimed until Gate 3 actually passes from a clean
   single updater attempt.

## Repo Follow-Up Status

The immediate code follow-up from this run is narrow:

- updater active-run lock;
- atomic staged directory reservation;
- static/unit guards for both;
- runbook wording that forbids retry after an elevated timeout until process
  state is checked.

The restore/backup lane remains passed. Gate 3 remains open.
