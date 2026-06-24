# Gate Day Clean Windows Smoke - 2026-06-23 Rerun 14

## Verdict

Failed at Gate 2 restore.

Rerun #14 is still a meaningful forward move:

- Gate 1 passed again on the clean Windows PC.
- The PR #75 packaged manual backup fix worked.
- The first failing step moved from backup creation to restore database recreation.

Do not mark the backup/restore gate complete from this run. Gates 3-5 were not
attempted because the strict run stopped at the first Gate 2 failure.

## Source And Artifact Provenance

- USB prep: `I:\BellField-GateDay-2026-06-20` on the review machine; `D:\BellField-GateDay-2026-06-20` on the scratch machine.
- Clean-install artifact: `artifacts\bellfield-v0.0.1-gateday.20260623.25.zip`.
- Update artifact present but not attempted: `artifacts\bellfield-v0.0.1-gateday.20260623.26.zip`.
- Source commit: `a730639de7e5c9b20f4397b393068777ff4c3b20` from PR #75.
- USB hash verification on the review machine after reinsertion: `122 checked, 0 failed`.
- Scratch-machine hash verification before extraction: `122 checked, 0 failed`.

## Gate 1 Result

Gate 1 passed:

- Clean artifact extracted with Windows `tar.exe`.
- Baseline collector ran before server config, PostgreSQL, or services.
- Server config completed with relay disabled.
- LAN helper failed closed on Public Wi-Fi first, then changed the trusted Wi-Fi
  profile to Private after operator consent.
- BellField-managed firewall rules opened only office/API TCP ports `3000` and
  `3001` for Private/Domain LocalSubnet.
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
- Browser customer/location/job proof completed.
- Reboot recovery passed; services returned and `/health` was `ok`.
- Packaged LAN evidence reported `effectiveLanAccess: true`.
- Real second-device proof passed from an iPhone 14 Pro Max on the same Wi-Fi,
  with cellular disabled; the phone reached `http://192.168.50.131:3000`,
  logged in, and reached Dispatch.

## Gate 2 Result

Gate 2 failed during restore:

- The packaged manual backup helper succeeded.
- Backup set:
  `C:\BellField\data\backups\bellfield-backup-20260624-040114Z-a284b6fa`.
- Required backup shape was present: `database.dump`, `media\`,
  `license\bellfield-license.json`, and `manifest.json`.
- A post-backup marker job was created after the backup:
  `AFTER-BACKUP-MARKER rerun 14 restore should erase this job`.
- Restore failed before marker verification.

First failing command:

```powershell
C:\BellField\release\runtime\node\node.exe C:\BellField\release\tools\install\restore-backup.mjs --release-root=C:\BellField\release --install-root=C:\BellField --backup-set=C:\BellField\data\backups\bellfield-backup-20260624-040114Z-a284b6fa --confirm=RESTORE
```

Failure:

```text
createdb: error: database creation failed: ERROR:  permission denied to create database
Error: C:\BellField\release\postgres\bin\createdb.exe exited with 1
```

Interpretation: the old restore helper used the runtime `DATABASE_URL` role to
drop and recreate the configured database. That role owns the BellField database
but intentionally does not have cluster-level `CREATEDB`. Granting the runtime
role permanent `CREATEDB` would be the wrong fix. The restore path should avoid
database drop/create and restore through the owned database/schema path, with a
preflight before stopping services.

## Machine State At Stop

- Rebooted during Gate 1: yes.
- `bellfield-postgres`: Running as `NT SERVICE\bellfield-postgres`.
- `bellfield-api`: Stopped.
- `bellfield-worker`: Stopped.
- `bellfield-office-web`: Stopped.
- `/health`: unreachable.
- Restore staging leftovers observed:
  - `C:\BellField\data\media.restore-stage-20260624-040304Z`
  - `C:\BellField\data\license\bellfield-license.json.restore-stage-20260624-040304Z`

## Operator Notes

- LAN Public-profile refusal was correct, but ordinary output redirection wrote
  an empty evidence file. Transcript capture showed the useful error. The helper
  should make the refusal visible through ordinary evidence capture.
- Baseline evidence used numeric `NetworkCategory` values without human labels.
- The service installer printed repeated transient `/health` connection errors
  before the API reached `ok`; the final behavior was correct, but the transcript
  looks scarier than necessary.
- Codex browser automation could not paste from the Windows clipboard after the
  first-owner token helper copied the token. This is a test-harness issue, not a
  normal human install failure.
- Job proof was ultimately clear on the job detail page, but Dispatch and Jobs
  queue counts made the proof path confusing.
- Evidence capture produced mixed-encoding/NUL artifacts during the run; the USB
  mutable evidence was normalized at closeout.

## Required Follow-Up

1. Fix `tools/install/restore-backup.mjs` so restore does not require the runtime
   app role to have `CREATEDB`.
2. Add a release ZIP smoke guard that restores a worker-produced backup through a
   non-`CREATEDB` app role and proves post-backup marker data is removed.
3. Keep Gate 2 open until a rebuilt artifact passes the scratch-machine restore
   drill from a fresh backup set.
4. Do not attempt Gates 3-5 on this artifact pair; rebuild after the restore fix
   and rerun the strict checklist.
