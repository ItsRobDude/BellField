# Gate Day Clean Windows Smoke - 2026-06-26 Rerun 16

## Verdict

Failed at Gate 3 update.

This run was still a useful improvement over rerun 15:

- Gate 1 passed again from the refreshed `.29` artifact.
- Gate 2 backup and restore passed again from a real worker-produced backup set.
- Restore proved database rollback, media read/write, license restoration, browser
  login, and API health.
- The updater no longer failed silently or left the app down. It emitted
  structured phase/failure evidence, cleaned the abandoned staged release, and
  restarted the original `.29` services.
- Gate 3 still did not complete. Windows refused to rename the live
  `C:\BellField\release` directory during the `.29` to `.30` release swap.

Do not mark the installed updater gate complete from this run. Gate 4 expired
update-window refusal and Gate 5 relay/customer-acceptance proof were not
attempted because the strict run stopped at the first Gate 3 failure.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-25`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-25`.
- Clean-install artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260625.29.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260625.30.zip`.
- Source commit:
  `6ed4efb66237c9f1bf4d1bfc42eee2b46ddef0b6`.
- USB hash verification after prep:
  `101 checked, 0 failed`.
- Scratch-machine hash verification before extraction:
  `101 checked, 0 failed`.

Primary USB evidence:

- `evidence\gate-day-2026-06-25-rerun-16.md`
- `evidence\command-log.txt`
- `evidence\install-baseline-rerun-16.json`
- `evidence\service-evidence-rerun-16.json`
- `evidence\lan-evidence-rerun-16.json`
- `evidence\backup-helper-rerun-16-summary.json`
- `evidence\restore-rerun-16-summary.json`
- `evidence\update-rerun-16-summary.json`
- `evidence\final-evidence-hygiene-rerun-16.json`

Final evidence hygiene passed after a false-positive cleanup: UTF-8 checks,
Markdown fence checks, JSON parse checks, and secret-marker scans all passed.

## Gate 1 Result

Gate 1 passed.

The clean install used artifact `.29` and completed the expected install path:

- USB/package hash verification passed.
- The clean machine had no checked developer tools on PATH and no pre-existing
  `C:\BellField`.
- Artifact A extracted with Windows `tar.exe`.
- Baseline collection succeeded after retrying a Codex command-wrapper mistake.
- Server config, LAN config, PostgreSQL provisioning, packaged migrations, valid
  license placement, service manifest rendering, and service installation all
  passed.
- All four Windows services were Running with nonzero process IDs:
  `bellfield-postgres`, `bellfield-api`, `bellfield-worker`, and
  `bellfield-office-web`.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- Elevated ACL readback passed.
- First-owner setup completed through the browser.
- Browser proof created customer/location/job data:
  `Gate Day Customer 16`, `Gate Day Test Site 16`, and
  `Gate Day booking proof 16 - no cooling`.
- Reboot recovery passed; services returned automatically and API `/health`
  returned `ok`.
- Post-reboot login and data readback passed.
- Packaged LAN evidence reported `effectiveLanAccess: true`.
- Real second-device same-LAN office-web proof passed by operator report.

Gate 1 rough edges:

- A non-elevated ACL readback failed on hardened paths and had to be retried
  elevated. This is acceptable evidence-wise, but the runbook should keep that
  expectation clear.
- Several collectors wrote good JSON but gave little human-readable success
  output.
- The setup-token clipboard handoff did not reach the in-app browser clipboard;
  the operator used a safe fallback without saving the token to evidence.
- Dispatch still showed confusing appointment/job wording after the browser job
  proof.

## Gate 2 Result

Gate 2 passed.

- Packaged backup helper created a worker-shaped backup set:
  `C:\BellField\data\backups\bellfield-backup-20260626-141430Z-a64532f8`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- A post-backup marker job was created after the backup:
  `AFTER-BACKUP-MARKER rerun 16`.
- Restore completed through the packaged helper with exit code `0`.
- Services were Running after restore and API health returned `ok`.
- Browser proof after restore showed:
  - pre-backup job `1003` still present;
  - post-backup marker job `1004` absent;
  - media storage read/write OK;
  - installed license still matched the backup-set license bytes;
  - System page showed database reachable, `74` migrations applied, and app
    version `.29`.

Gate 2 rough edges:

- Restore printed an initial service-readiness failure before retrying service
  start and recovering to health `ok`. This is functionally correct but
  operator-noisy during a destructive restore.
- The System Backups card showed `Last run failed` /
  `Latest backup failed: Backup run did not complete before worker restart`
  after the successful restore proof. That is a product trust issue, not a Gate
  2 data-integrity failure.
- The manual post-restore health probe was only useful after adding JSON output;
  evidence-friendly health commands should serialize the response.

## Gate 3 Result

Gate 3 failed during the real `.29` to `.30` installed update.

The update artifact extracted correctly to:

```text
C:\BellField-update-rerun-16\release
```

The updater was launched from that separate `.30` release directory with no skip
flags:

```powershell
.\runtime\node\node.exe .\tools\install\update-bellfield.mjs --install-root=C:\BellField --current-release-root=C:\BellField\release --confirm=UPDATE
```

The important difference from rerun 15 is that the updater now produced
structured evidence and recovered the machine:

- Phase output reached `swappingRelease`.
- Pre-update backup succeeded:
  `C:\BellField\data\backups\bellfield-backup-20260626-143426Z-3a5a1890`.
- App services stopped in about four seconds.
- Captured BellField service process tree was reported exited.
- The release swap then retried for 60 seconds and failed 59 times.
- Terminal failure line:
  `BELLFIELD_UPDATE_FAILURE`.
- Failure phase:
  `swappingRelease`.
- Final cause:
  `EPERM: operation not permitted, rename 'C:\BellField\release' -> 'C:\BellField\release.restore-rollback-20260626-143404Z'`.
- Because the installed release swap had not completed, updater recovery
  restarted the original `.29` services.
- The abandoned staged update release was removed:
  `C:\BellField\release.restore-stage-20260626-143404Z`.
- API health returned `ok` after recovery.
- Installed build manifest still reported `.29`, as expected after a pre-swap
  failure.

Interpretation: the updater safety work did its job as recovery and evidence,
but the update product path is still not shippable. The likely direct blocker is
now visible in the code path: the updater stopped only the app services before
renaming `C:\BellField\release`, while `bellfield-postgres` also runs from the
installed release tree. Windows will not rename a directory containing a running
process image. The rerun-16 process list was captured after recovery restarted
services, so the next fix should also collect concise pre-recovery release-root
process evidence at the swap failure point.

## Machine State At Stop

- `C:\BellField\release` remained installed on `.29`.
- `C:\BellField\release.restore-stage-20260626-143404Z` was removed by updater
  cleanup.
- No rollback release directory was created because the first rename
  `release -> release.restore-rollback-*` never succeeded.
- Pre-update backup exists:
  `C:\BellField\data\backups\bellfield-backup-20260626-143426Z-3a5a1890`.
- `bellfield-postgres`: Running as `NT SERVICE\bellfield-postgres`.
- `bellfield-api`: Running.
- `bellfield-worker`: Running.
- `bellfield-office-web`: Running.
- API `/health`: `ok`.
- Update extract root still exists:
  `C:\BellField-update-rerun-16`.

This is a much safer stop state than rerun 15, where the app services were left
stopped and a staged release copy was left behind.

## Required Follow-Up

1. Fix the release-swap blocker by stopping `bellfield-postgres` after the app
   services and before the release swap, then starting PostgreSQL again before
   packaged migrations run. Also capture pre-recovery release-root process
   evidence if the swap still fails.
2. Consider changing the update strategy away from renaming the live release
   directory while service wrappers live inside it. A pointer/current-version
   layout or stable service-wrapper directory would avoid replacing the service
   executable tree in place.
3. Preserve the rerun-16 recovery behavior. Pre-swap failure must keep
   restarting the original installed release and cleaning abandoned staged
   release directories.
4. Improve operator-facing updater output. The structured JSON is useful, but a
   non-developer still needs a short final summary: attempted version, installed
   version, backup path, failed phase, whether services were recovered, and next
   safe action.
5. Fix the backup-status trust issue after restore. A successful restore should
   not leave the System Backups card looking like the backup/restore path failed.
6. Add concise success output to the service/LAN/evidence collectors so evidence
   files are not the only place a human can tell a step passed.
7. Keep Gate 4 and Gate 5 unclaimed until Gate 3 is actually passing, then rerun
   the strict gate with fresh artifacts.

## Repo Follow-Up Status

Rerun 16 proves that the updater hardening after rerun 15 improved the failure
mode:

- phase logging works;
- bounded swap retry works;
- terminal failure JSON is captured;
- pre-swap recovery restarts the original release;
- staged update cleanup works;
- evidence redaction/hygiene stays parseable.

The remaining blocker is narrower and more concrete: the installed-service
update cannot yet swap the live release directory on Windows because the update
stop set did not include PostgreSQL, even though PostgreSQL runs from the same
release tree. The next patch should stop all four BellField services before the
swap, restart PostgreSQL before migrations, preserve pre-swap recovery, and
record pre-recovery release-root process evidence if the swap still fails.
