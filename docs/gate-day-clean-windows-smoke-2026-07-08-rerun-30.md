# Gate Day Clean Windows Smoke - 2026-07-08 Rerun 30

## Outcome

**PASS for the active `START-HERE.txt` sequence through Gate 3 and the
post-update reboot.**

Rerun 30 closed the real installed-service update gate that remained open after
rerun 19. The clean Windows machine completed:

- Gate 1 clean install, first-owner sign-in, browser job booking, reboot
  recovery, LAN evidence, and real second-device browser access;
- Gate 2 packaged backup and owned-schema restore with services and API health
  recovered; and
- Gate 3 installed `.55` to `.56` update with a real pre-update backup,
  preserved rollback release, durable terminal success evidence, and healthy
  services after the required reboot.

Gate 4 expired-window refusal and Gate 5 sold-shaped relay acceptance were not
attempted. There was no product blocker in the scope that ran.

## Source And Media

- USB root on the clean machine: `D:\BellField-GateDay-2026-07-01`
- USB root during repo review: `I:\BellField-GateDay-2026-07-01`
- Source PR: `#93 Create the Gate Day first owner automatically (rerun-29 blocker)`
- Source commit: `2d0670fc40533c73eb12609378e9e466f8b1ee2a`
- Clean-install artifact: `bellfield-v0.0.1-gateday.20260707.55.zip`
- Clean-install SHA-256:
  `624c705683ed7efa12632a8fe3adb7bedbfc05559b986ba010129b1e68ca2fca`
- Update artifact: `bellfield-v0.0.1-gateday.20260707.56.zip`
- Update SHA-256:
  `4078174f45bfb9f8ef2b31aade24a4e25f1e81d54d0d3bb5e9e72ddd622691a3`
- Physical-media verification repeated during review on 2026-07-10: `189`
  checked, `0` failed.

The baseline recorded Windows 11 Home build `26200`, Windows PowerShell
`5.1.26100.8655`, no existing `C:\BellField` install root, and no pre-existing
BellField services.

## Gate 1 - Clean Install

The runner prepared and signed-manifest-verified artifact `.55`, then published
it to `C:\BellField\release`. The fixed install sequence completed server config,
LAN/firewall configuration, PostgreSQL provisioning, 74 packaged migrations,
license placement, service rendering, service installation, and evidence
collection.

The runner automatically created the documented Gate Day owner. Browser proof
then completed with that credential:

- customer `Gate Day Customer rerun-30` created;
- active location `Gate Day Shop` created;
- Job 1003, `Gate Day booking proof rerun-30`, created and opened; and
- API health returned `ok`.

After reboot, all four services returned automatically, API health was `ok`,
the owner could sign in again, and Job 1003 remained visible. Packaged LAN
evidence showed effective LocalSubnet firewall rules, listeners on ports 3000
and 3001, and successful installed-PC checks through the selected LAN IP. A real
iPhone 14 Pro Max on the same LAN loaded the office app, signed in, and reached
the Dispatch board.

## Gate 2 - Backup And Restore

The packaged runner created:

`C:\BellField\data\backups\bellfield-backup-20260709-025614Z-2d0317e9`

The evidence readback confirmed `database.dump`, `manifest.json`, media, and the
license copy. After the backup, the browser created Job 1004 with the marker
`AFTER-BACKUP-MARKER rerun-30`. The restore helper then completed the owned-schema
database restore, media/license swap, and migration readback. All four services
were running and API health was `ok` afterward.

The first post-restore health probe missed readiness. The helper retried service
start once and then reached health successfully. This is not a failed restore,
but it remains an operator-experience signal worth watching.

Evidence limitation: the command log records creation of Job 1004 and a
successful restore, but it does not contain a separate post-restore browser
readback explicitly showing Job 1004 absent. Rerun 15 already closed the marker
erasure proof; future strict runs should capture the same direct readback so the
current run stands alone on that assertion.

## Gate 3 - Installed Update

The runner prepared and verified artifact `.56` at
`C:\BellField-update-rerun-30-56\release`. The updater then completed every
durable phase through `healthChecking`:

`verifying > staging > staged > preparingStagedServices >
stagedServicesPrepared > backingUp > backupComplete > stoppingServices >
servicesStopped > waitingForProcessExit > processesExited > swappingRelease >
releaseSwapped > startingPostgres > postgresStarted > migrating > migrationsRun

> startingServices > healthChecking`

PostgreSQL accepted connections on the first `pg_isready` attempt. The durable
terminal record was:

- event: `BELLFIELD_UPDATE_RESULT`
- status: `succeeded`
- installed version: `0.0.1-gateday.20260707.56`
- `readinessRecovered: true`
- pre-update backup:
  `C:\BellField\data\backups\bellfield-backup-20260709-040012Z-163839e9`
- rollback release:
  `C:\BellField\release.restore-rollback-20260709-035955Z`

The first application readiness attempt did not finish within its initial
window. The updater retried service readiness and completed successfully. After
the required reboot, `collect-only` succeeded, API health was `ok`, the System
surface showed `.56`, and all four services were running:

- `bellfield-postgres` as `NT SERVICE\bellfield-postgres`;
- `bellfield-api` as `LocalSystem`;
- `bellfield-worker` as `LocalSystem`; and
- `bellfield-office-web` as `LocalSystem`.

The read-only update collector found no staged release directory, preserved the
expected rollback directory, parsed the successful durable terminal event, and
reported the current `.56` manifest.

## Process And Evidence Notes

Several UAC prompts were missed or cancelled before product work. Each was
classified as `attention-missed`; retries occurred only after checking that no
matching runner/updater process was active. These did not invalidate any gate.

The Gate 3 prepare process survived a Codex turn interruption. Reading runner
JSONL and process state before retry prevented an overlapping update. One Gate 1
monitor wrapper returned nonzero after the packaged runner had already reached
its expected `needs-human-action` terminal state; runner JSONL and machine
readback remained authoritative.

The final evidence hygiene scan reported `29` files scanned and `0` issues.
Mutable evidence was checked for JSON/JSONL parseability, control characters,
transcript artifacts, and unredacted secret-like markers.

## Evidence Reviewed

- `evidence\gate-day-2026-07-07-rerun-30.md`
- `evidence\command-log-rerun-30.txt`
- `evidence\gate-day-admin-runner-rerun-30.jsonl`
- `evidence\gate3-update-durable-rerun-30-update-20260709-035953Z.jsonl`
- `evidence\install-baseline-rerun-30.json`
- `evidence\service-evidence-rerun-30.json`
- `evidence\lan-evidence-rerun-30.json`
- `evidence\update-state-evidence-rerun-30.json`
- `evidence\evidence-hygiene-scan-closeout-control-cleanup-rerun-30.json`
- `build-evidence\source-summary-rerun-30.json`
- `START-HERE.txt` and `SHA256SUMS.txt`

## Remaining Gate-Day Work

- Gate 4: prove real updater refusal with an expired-window license.
- Gate 5: prove the sold-shaped installed release sends through the production
  relay and applies the customer acceptance decision.
- Complete the broader second-office-desktop and real Android field-device proof
  tracked by launch readiness; the iPhone office-browser proof closes only the
  Gate 1 second-device requirement.
- Keep the successful readiness retries visible. If restore/update repeatedly
  require the retry branch, investigate service startup timing rather than
  calling the completed operations failures.
- Add an explicit post-restore browser marker-absence readback to future strict
  evidence templates.
