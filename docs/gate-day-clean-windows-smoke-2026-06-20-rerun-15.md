# Gate Day Clean Windows Smoke - 2026-06-24 Rerun 15

## Verdict

Failed at Gate 3 update.

Rerun #15 is still a major forward move:

- Gate 1 passed again on the clean Windows PC.
- Gate 2 backup and restore passed from a real worker-produced backup set.
- The restored database preserved pre-backup data and erased the post-backup
  marker.
- Restore brought services back and the browser/System proof passed, with two
  operator-experience rough edges.
- Gate 3 update from `.27` to `.28` failed after the updater continued beyond the
  outer wrapper timeout and left the machine in a partial pre-swap state.

Do not mark the update gate complete from this run. Gates 4-5 were not attempted
because the strict run stopped at the first Gate 3 failure.

## Source And Artifact Provenance

- USB prep root on the review machine:
  `I:\BellField-GateDay-2026-06-20`.
- USB root on the scratch machine during the run:
  `D:\BellField-GateDay-2026-06-20`.
- Clean-install artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260624.27.zip`.
- Update artifact:
  `artifacts\bellfield-v0.0.1-gateday.20260624.28.zip`.
- Source commit:
  `d60afaf17f0de46b1b6d981334b6731f9bbf399f`.
- Review-machine USB hash verification after reinsertion:
  `123 checked, 0 failed`.
- Scratch-machine hash verification before extraction:
  `123 checked, 0 failed`.

Primary USB evidence:

- `evidence\gate-day-rerun-15-2026-06-24.md`
- `evidence\command-log-rerun-15.txt`
- `evidence\install-baseline-rerun-15.json` - JSON parse passed on review.
- `evidence\service-evidence-rerun-15.json` - JSON parse failed on review after
  a post-collection setup-token redaction broke the `bellfield-api` log-tail
  string. The Markdown notes and raw command log still contain usable service
  readback, but this JSON file is not machine-readable evidence.
- `evidence\lan-evidence-rerun-15.json` - JSON parse passed on review.

## Gate 1 Result

Gate 1 passed:

- Clean artifact extracted with Windows `tar.exe`.
- Baseline collector ran before server config, PostgreSQL, or services.
- Server config completed with relay disabled.
- LAN helper used the Public-profile refusal/explicit-consent path, then wrote
  LAN-safe office/API URLs and managed firewall rules.
- PostgreSQL provisioning and packaged migrations completed.
- Valid license was placed at the configured install path.
- Windows service rendering and elevated service installation completed.
- `bellfield-postgres` read back from SCM as
  `NT SERVICE\bellfield-postgres`.
- API, worker, office-web, and PostgreSQL services were Running with nonzero
  process ids.
- ACL readback completed.
- First-owner setup completed through the real browser flow using the documented
  disposable Gate Day credential.
- Browser customer/location/job/appointment proof completed.
- Reboot recovery passed; services returned and `/health` was `ok`.
- Packaged LAN evidence reported `effectiveLanAccess: true` for
  `192.168.50.131`.
- Real second-device proof passed after the operator reported
  `SECOND DEVICE PASS`.

## Gate 2 Result

Gate 2 passed with rough edges.

- Packaged manual backup helper succeeded.
- Backup set:
  `C:\BellField\data\backups\bellfield-backup-20260625-015732Z-1e99c124`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- A post-backup marker job with problem summary `AFTER-BACKUP-MARKER` was created
  after the backup.
- Restore completed with exit code `0` through the owned-schema path.
- The expected PostgreSQL cascade notice listed BellField application tables.
- Migrations were already current: `74` applied, none pending.
- Previous media root and license file were preserved as rollback paths.
- Post-restore service readback showed API, worker, office-web, and PostgreSQL
  all Running; PostgreSQL still ran as `NT SERVICE\bellfield-postgres`.
- Post-restore browser proof showed pre-backup job data present and
  `AFTER-BACKUP-MARKER` absent.
- System proof showed database reachable, `74` migrations applied, media
  read/write OK, license licensed, app version `.27`, and restored backup
  history visible.

Rough edges:

- The first immediate post-restore `/health` probe failed with
  `Unable to connect to the remote server`; a bounded retry returned
  `status: ok`.
- The System Backups card showed
  `Latest backup failed: Backup run did not complete before worker restart`
  after the successful restore proof, which makes a good restore look unhealthy
  until the operator understands it as a worker-interruption artifact.

## Gate 3 Result

Gate 3 failed during the real `.27` to `.28` update.

The update artifact extracted correctly to:

```text
C:\BellField-update-gateday-20260624-28-rerun15\release
```

The updater was then launched from that separate `.28` release directory with no
skip flags:

```powershell
.\runtime\node\node.exe .\tools\install\update-bellfield.mjs --install-root=C:\BellField --current-release-root=C:\BellField\release --confirm=UPDATE
```

Observed behavior:

- The outer command wrapper timed out after 10 minutes with no captured updater
  progress.
- The elevated updater process continued after the wrapper timeout.
- Later readback showed a fresh pre-update backup existed:
  `C:\BellField\data\backups\bellfield-backup-20260625-021957Z-78f55dea`.
- Later readback showed the `.28` release staged at:
  `C:\BellField\release.restore-stage-20260625-021942Z`.
- The installed release remained `.27`.
- API, worker, and office-web services were Stopped.
- PostgreSQL remained Running as `NT SERVICE\bellfield-postgres`.
- API `/health` was not reachable.

Interpretation: the updater got past artifact staging and pre-update backup, then
failed or stalled after it had started touching app services but before a
successful release swap/restart. The current updater does not emit enough phase
progress or a failure-state summary to tell an operator exactly which phase
failed, which paths are safe to preserve, and whether the original services
should be restarted.

## Machine State At Stop

- Rebooted during Gate 1: yes.
- `C:\BellField\release` remained installed on `.27`.
- `C:\BellField\release.restore-stage-20260625-021942Z` contained staged `.28`.
- `C:\BellField\data\backups\bellfield-backup-20260625-021957Z-78f55dea`
  existed with `database.dump`, `manifest.json`, `media\`, and
  `license\bellfield-license.json`.
- `bellfield-postgres`: Running as `NT SERVICE\bellfield-postgres`.
- `bellfield-api`: Stopped.
- `bellfield-worker`: Stopped.
- `bellfield-office-web`: Stopped.
- `/health`: unreachable.

## Operator Notes

- Restore now works functionally, but the helper reports completion before API
  readiness is guaranteed. Either the helper should poll `/health`, or the
  runbook must require a bounded post-restore health retry before continuing.
- A successful restore can leave the System Backups card showing a failed latest
  backup caused by worker restart/interruption. That should be labeled more
  clearly or suppressed when it is expected restore-drill fallout.
- The update path is too quiet for a destructive operator step. The wrapper timed
  out, the elevated child continued, and the final partial state was only clear
  after later readback.
- Non-elevated containment could not stop the elevated updater process tree
  (`Access is denied`). Any future containment path must be documented as an
  elevated diagnostic/recovery command, not an ad hoc non-elevated kill attempt.
- The mutable evidence hygiene pass redacted a setup-token line in
  `service-evidence-rerun-15.json` but left that JSON invalid. Future evidence
  redaction must re-parse JSON artifacts after redaction before declaring hygiene
  complete.
- Job creation and appointment scheduling still have UX wording issues: dispatch
  date/window did not clearly create an appointment, and the appointment success
  toast used surprising `Follow-up added` wording.

## Required Follow-Up

1. Harden `tools/install/update-bellfield.mjs` with explicit phase progress,
   bounded phase timeouts, and a failure-state summary.
2. Track the update boundary where the current release is still intact. If a
   failure happens after service stop but before release swap, attempt to restart
   the original `.27` app services and report that recovery.
3. If a failure happens after release swap, print the rollback release path,
   pre-update backup path, service states, installed/staged versions, and the
   recommended recovery action.
4. Add blocking helper coverage/static guards for updater progress and recovery
   behavior. The existing `smoke:updater` remains scratch-only because it uses
   skip flags; it does not prove real Windows service stop/start behavior.
5. Harden evidence redaction so JSON artifacts remain valid after setup-token
   redaction. Add a check that runs the PowerShell redactor against serialized
   JSON containing a setup-token log tail and then parses the result.
6. Add post-restore readiness handling: either poll `/health` before
   `restore-backup.mjs` prints completion or make the restore runbook's bounded
   retry window mandatory.
7. Rebuild a fresh artifact pair only after the updater hardening lands, refresh
   the USB, and rerun the strict gate. Gate 2 is now proven; the next blocking
   target is Gate 3 update.

## Repo Follow-Up Status

The updater hardening patch after this run addresses items 1-6 by adding
structured update phase/result/failure output, bounded timeouts, best-effort
WinSW service process-tree exit waiting, bounded release-swap retry, pre-swap
service recovery, staged-release cleanup, updater recovery unit tests/static
guards, parse-safe setup-token JSON redaction coverage, and post-restore API
readiness polling. The remaining proof is a fresh artifact rebuild/USB refresh
and strict Gate 3 rerun on the clean Windows PC.
