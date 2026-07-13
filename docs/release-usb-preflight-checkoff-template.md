# Release USB Preflight Checkoff Template

Copy this file into the USB as
`build-evidence/preflight-checkoff-rerun-<N>-<YYYY-MM-DD>.md` during USB prep.
The USB-prep Codex/operator fills it on the dev machine before the
scratch-machine gate starts. The clean-machine Codex should read it only as
prep provenance, not as a checklist to complete during the gate. Do not paste
live relay tokens, first-owner setup tokens, database URLs, license private
keys, or raw env files.

## Verdict

- Ready for scratch-machine gate: yes/no
- Prepared at:
- Prepared by:
- Known risks or deliberately skipped checklist items:

## Source Provenance

- Source commit:
- Branch / PR / merge commit:
- `git status --short --branch` result:
- `--allow-dirty=true` used: yes/no
- Reason if dirty build was used:

## Active Artifacts

| Role          | Artifact | Version | Release date | Manifest source commit | SHA256 |
| ------------- | -------- | ------- | ------------ | ---------------------- | ------ |
| Clean install |          |         |              |                        |        |
| Update        |          |         |              |                        |        |

## Release Inputs

- PostgreSQL root:
- VC redist root:
- WinSW executable:
- License file:
- Expired-window license file:
- Reused licenses still cover active release dates: yes/no

## Source-Level Gates

Record the evidence path or command result for each gate. These run once for the
final source commit when both artifacts use that same commit.

- Required GitHub checks green for the source commit (`quality` and
  `install-helper-smoke`):
- `pnpm smoke:install-helpers` (including LAN address-filter effectiveness
  guard):
- `pnpm smoke:install-config`:
- `pnpm smoke:service-manifests`:
- CI API identity-attempt PostgreSQL regression:
- `pnpm format:check`:
- `git diff --check`:
- `pnpm security:secrets`:

## Per-Artifact Gates

Record the pass/fail result and evidence path for each active ZIP. The
release ZIP smoke must pass; a command invocation without a passing result is
not a USB-ready artifact gate.

| Artifact      | `smoke:release-build -- --require-gate-day-deps=true` result/evidence | `smoke:release-zip -- --require-gate-day-deps=true` PASS/evidence |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Clean install |                                                                       |                                                                   |
| Update        |                                                                       |                                                                   |

## USB Layout

- USB root:
- `START-HERE.txt` names clean-install artifact: yes/no
- `START-HERE.txt` names update artifact: yes/no
- `START-HERE.txt` names `run-gate-day-admin.ps1` as the default Gate Day admin path: yes/no
- Runner prepare modes listed for artifact A and artifact B extraction: yes/no
- `START-HERE.txt` uses `$UsbRoot`-anchored `$ArtifactA`/`$ArtifactB` variables
  for `-ArtifactZip`, not `.\artifacts\...`: yes/no
- Raw `Expand-Archive` is diagnostic/fallback only, not the strict Gate Day path: yes/no
- Runner modes listed for Gate 1, Gate 2, Gate 3, and Gate 4: yes/no
- Gate 4 `gate4-expired-refusal` command present after the Gate 3 update
  command with a `$UsbRoot`-anchored `-ExpiredLicensePath`: yes/no
- Per-helper `Start-Process -Verb RunAs` commands are diagnostic/fallback only: yes/no
- `artifacts/` contains only active artifacts: yes/no
- Superseded artifacts archived on USB or removed:
- Durable evidence path for removed artifacts:
- Offline docs refreshed after final doc edits: yes/no
- Evidence templates refreshed and rerun number/date:
- `build-evidence/` includes active artifact evidence: yes/no
- `build-evidence/` includes this completed checkoff: yes/no

## Hash And Secret Checks

- `SHA256SUMS.txt` regenerated after final immutable USB change: yes/no
- Excluded hash prefixes: `evidence/**`, `private-relay-config/**`
- USB hash verification command:
- USB hash verification summary:
- Secret scan command:
- Secret scan result:
- Expected placeholder-only hits:

## Cleanup

- No packaged PostgreSQL or `pg_ctl` process remains: yes/no
- No release ZIP smoke office-web/Next process remains: yes/no
- No `bellfield-release-postgres-smoke-*` temp directory remains: yes/no
- No `bellfield-release-zip-smoke-*` temp directory remains: yes/no
- No `bellfield-release-migration-smoke-*` temp directory remains: yes/no
- USB was removed/reinserted or otherwise read back after prep: yes/no

## Deviations

List every checklist item that was skipped, changed, or satisfied by equivalent
evidence instead of the literal command.

-
