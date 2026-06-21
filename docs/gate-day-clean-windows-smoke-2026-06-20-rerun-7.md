# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 7

This records the seventh fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-7-2026-06-21.md`,
`evidence/command-log-rerun-7.txt`,
`evidence/service-evidence-rerun-7.json`, and related redacted log-tail files.
This repo doc is the sanitized, durable summary.

Status: **failed at Gate 1 first-owner setup**.

Rerun #7 moved the blocker forward. The clean Windows service install,
PostgreSQL service identity, service ACL model, runtime config validation,
service stability check, and API `/health` all passed. The first failing step
was browser first-owner setup, where the office app stayed on the create-owner
screen and displayed `Internal server error`.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260621.13.zip`
  - version: `0.0.1-gateday.20260621.13`
  - release date: `2026-06-21`
  - source commit: `cb2bf96`
  - SHA256:
    `B754F870CB4B85172DA488C612AFEBB66A8EA8C2365BD91E2281827A8330C054`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260621.14.zip`
  - version: `0.0.1-gateday.20260621.14`
  - release date: `2026-06-21`
  - source commit: `cb2bf96`
  - SHA256:
    `97309D0B6CF5F26BE33E153E86357297901686F55F61CA20DFE3C18551180C2D`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- User: `ancol`
- USB drive letter on the scratch machine: `D:`
- Gate start: `2026-06-21T10:56:42.8633912-07:00`
- Codex shell was not elevated at baseline; elevated work was launched only
  for the runbook steps that required UAC.
- `C:\BellField` was absent before extraction.
- No pre-existing BellField services were present.
- No disallowed developer tooling was found on `PATH` for:
  `node`, `git`, `psql`, `pnpm`, `npm`, `docker`, or `code`.
- Relevant listening ports were clear before install.
- Required USB docs were read:
  `START-HERE.txt`, `docs\codex-install-test-operator-rules.md`,
  `docs\gate-day-checklist.md`, `docs\install-runbook.md`, and
  `docs\restore-runbook.md`.

## What Passed

Run #7 proves the rebuilt artifacts corrected the rerun-6 relay-disabled
startup failure and the installer now owns meaningful service health gates on
the clean Windows machine.

- Active artifact hashes matched `SHA256SUMS.txt` after the hash wrapper
  normalized Windows backslash paths to the forward-slash paths stored in the
  SHA list.
- Artifact `.13` extracted to `C:\BellField` using Windows built-in `tar.exe`.
- Required packaged runtime/tooling files were present after extraction.
- `write-server-config.mjs` completed and produced the expected clean-install
  relay-disabled shape:
  - `BELLFIELD_RELAY_SERVER_INSTANCE_ID` present
  - `BELLFIELD_RELAY_BASE_URL` blank
  - `BELLFIELD_RELAY_TOKEN` blank
- `provision-postgres.mjs` completed.
- Packaged migrations ran from the extracted release tree and completed:
  `Applied 74 migrations. Migrations are now up to date.`
- Temporary PostgreSQL was stopped after migrations.
- The valid license was copied to
  `C:\BellField\data\license\bellfield-license.json`; hash readback was
  captured.
- `render-windows-services.mjs` completed. The PostgreSQL WinSW XML did not
  contain a `<serviceaccount>` block.
- `install-windows-services.ps1` completed under elevation with exit code `0`.
- The installer output confirmed:

  ```text
  bellfield-postgres SCM StartName confirmed as NT SERVICE\bellfield-postgres.
  { status: ok, api: { nodeEnv: production, port: 3001, relayConfigured: false, licenseRequired: true, licensePathConfigured: true }, worker: { nodeEnv: production, relayConfigured: false, backupEnabled: true, backupRootConfigured: true } }
  bellfield-postgres state confirmed as Running.
  bellfield-api state confirmed as Running.
  bellfield-worker state confirmed as Running.
  bellfield-office-web state confirmed as Running.
  BellField API health reached ok at http://127.0.0.1:3001/health.
  BellField services installed, started, stable, and healthy.
  ```

- Installed service readback showed four BellField services and zero
  non-running services.
- `bellfield-postgres` read back as
  `NT SERVICE\bellfield-postgres`.
- API `/health` returned `status: "ok"` after service installation.
- The packaged elevated service evidence collector exited `0` and wrote
  `service-evidence-rerun-7.json`.
- Service evidence captured the relay-disabled production env shape without
  printing secret values:
  - relay base URL: blank
  - relay token: blank
  - relay server instance ID: present
  - database URL/media secret/license path: presence only
- ACL readback passed:
  - env ACL broad-user check found no broad user entry
  - PostgreSQL data ACL included `NT SERVICE\bellfield-postgres`
- Elevated first-owner setup token extraction copied the token to the clipboard
  without printing the token to evidence.
- At closeout, all four services were still running and API `/health` was
  still `ok`.

## What Failed

Gate 1 failed at browser first-owner setup.

Browser-visible result:

- The page stayed on `Create owner account`.
- The page displayed `Internal server error` after submitting the setup form.
- Token and password values were not snapshotted or recorded.
- Per stop conditions, product validation stopped at this point and only
  diagnostic evidence was collected.

The redacted API error log showed:

```text
POST /identity/setup/first-owner
statusCode: 500
errorMessage: column "blocked_until" is of type timestamp with time zone but expression is of type text
stack: IdentityAccessRepository.recordFailedIdentityAttempt
```

This is a product bug in the failed-attempt persistence path. The
`identity_login_attempts.blocked_until` column is `timestamptz`, but the SQL
path that records a failed setup attempt supplied the `blockedUntil` parameter
in a way PostgreSQL treated as `text`.

Important nuance: because setup-token values are intentionally not retained in
evidence, the evidence cannot prove exactly what token text was submitted in
the browser. The API reached the failed-attempt path, which normally means the
submitted setup token was treated as invalid. That does not make the 500
acceptable: an invalid setup token should produce a controlled 401/429-style
response, not an internal server error. The next fix should cover the
failed-attempt database path directly, then rerun first-owner setup from a
clean scratch state.

No job booking, reboot, second-device, backup/restore, update, expired-license
refusal, or relay gate was attempted after this stop condition.

## Diagnosis

Run #7 closes the rerun-6 clean-install startup blocker for the current
artifact pair:

- A generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID` with blank relay base URL
  and token is accepted as relay disabled.
- API and worker runtime config validation accepts that shape in production.
- The installer starts all four services, waits for service stability, and
  requires API `/health` before reporting success.
- PostgreSQL runs as the intended virtual service account.
- The packaged collector can capture elevated service evidence after ACL
  hardening without dumping secret env values.

The current Gate 1 blocker is now first-owner setup error handling/persistence,
specifically the identity failed-attempt path behind
`/identity/setup/first-owner`.

The fix should be treated as production-grade identity hardening, not as an
installer workaround. At minimum:

1. Fix `recordFailedIdentityAttempt` so `blocked_until` writes use a proper
   timestamp/timestamptz value on insert/update.
2. Add a real repository/database regression test for recording failed setup
   attempts until a block is reached. Unit tests with mocked repositories did
   not catch the SQL typing issue.
3. Add or extend API endpoint coverage so an invalid first-owner setup token
   returns a controlled client error and never a 500.
4. Rerun the clean Windows Gate 1 from a cleaned scratch state and complete
   first-owner setup before moving to job booking/reboot/second-device gates.

## Operator Hiccups And Complaints

These were not the root product failure, but they should feed the next runbook
and evidence pass.

| Category          | Severity | Step                            | What happened                                                                                                                                                                                          | Follow-up                                                                                                                                                             |
| ----------------- | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hash-wrapper      | minor    | USB hash check                  | The first hash wrapper compared Windows backslash paths to `SHA256SUMS.txt` forward-slash entries, so expected hashes were blank and the run was falsely marked blocked.                               | Normalize relative paths to forward slashes before matching `SHA256SUMS.txt`; do not treat a blank expected hash as an artifact mismatch until the parser is checked. |
| checklist-wording | minor    | Write server config             | Strict readback initially marked config failed because `C:\BellField\data\postgres` did not exist yet. That directory is initialized by the PostgreSQL provisioning step, not by config writing.       | Clarify that `write-server-config.mjs` writes env/secrets and configured data roots; `PG_VERSION` appears only after `provision-postgres.mjs`.                        |
| evidence-wrapper  | minor    | Temporary PostgreSQL/migrations | A Codex wrapper timed out after 184 seconds before appending its command-log section. Readback showed PostgreSQL still running and no migration process.                                               | Long-running Windows wrappers need generous timeouts and incremental logging. Keep `pg_ctl -l <logfile>` and read logs separately.                                    |
| evidence-wrapper  | minor    | Migration rerun                 | The redirected migration run printed success and empty stderr, but the wrapper's `Start-Process` readback did not expose a numeric exit code, causing a false failed classification before correction. | Prefer direct commands where possible; if `Start-Process` is needed, capture a `-PassThru` process object and explicit timeout/exit evidence.                         |
| clipboard-cleanup | minor    | First-owner token handling      | `Set-Clipboard` rejected an empty string when clearing the setup token after use. The clipboard was then overwritten with a harmless placeholder.                                                      | Use a placeholder value for clipboard cleanup rather than an empty string on Windows PowerShell.                                                                      |
| secret-hygiene    | good     | Evidence redaction              | Initial evidence contained first-owner setup-token marker lines. A redaction pass and conservative recheck removed unredacted token lines; generated password hits were zero.                          | Keep the secret sanity scan and conservative token-line redaction as closeout requirements.                                                                           |
| gate-discipline   | good     | Stop decision                   | The run stopped after first-owner setup returned a 500 and did not hand-edit the database or bypass the setup flow.                                                                                    | Keep this discipline. Continuing after the failure would be diagnostic only, not a clean Gate 1 pass.                                                                 |

## Recommended Fix

1. Fix the identity failed-attempt SQL path so `blocked_until` is handled as a
   timestamp/timestamptz value and first-owner setup never returns a 500 for an
   invalid setup token.
2. Add database-backed tests for `recordFailedIdentityAttempt`, including the
   first failed attempt, repeated failures, threshold block, and reset-window
   behavior.
3. Add endpoint-level coverage for `/identity/setup/first-owner` invalid-token
   behavior so the office app receives a controlled response.
4. Preserve the current installer/service account/relay-disabled model; rerun
   #7 proved that part of the path on the clean machine.
5. Update operator docs so hash verification normalizes paths, config readback
   expectations match the runbook order, migration wrappers do not lose output
   on timeout, and clipboard cleanup uses a placeholder.
6. Rebuild the next artifact pair only after tests pass, refresh USB hashes,
   and rerun Gate 1 from a cleaned scratch machine.

Do not treat artifacts `.13`/`.14` as passed install artifacts. They proved the
service stack can install, stay up, and pass health on the clean Windows
machine, but the documented clean install still fails before owner setup is
complete.

## Result

Gate 1 remains open. Rerun #7 proved:

- artifact `.13`/`.14` hashes and extraction path were sound;
- packaged PostgreSQL provisioning and migrations work on the clean machine;
- generated relay instance ID plus blank base URL/token is accepted as relay
  disabled by packaged API and worker runtime config;
- the installer configures and reads back the PostgreSQL SCM account as
  `NT SERVICE\bellfield-postgres`;
- PostgreSQL starts and remains running under that account;
- service stability checks and API `/health` pass inside the installer;
- the packaged evidence collector works after ACL hardening;
- API, worker, office-web, and PostgreSQL were still running at closeout.

Rerun #7 did not prove:

- first-owner setup completion;
- browser job booking;
- reboot/service recovery;
- second-device access;
- backup/restore;
- update/refusal;
- relay send/acceptance.

Gates 2 through 5 were not reached.
