---
name: gate-review
description: Review the latest BellField Gate Day USB rerun evidence, diagnose the first failing step, and drive the fix to a merged PR. Use when the user says to review the USB / gate day results / the latest rerun, or reports that a USB gate test failed.
---

# Gate Day USB rerun review

You are reviewing evidence from a strict Gate Day run of the BellField installer
on the scratch machine (NONNA: Windows 11 Home, Windows PowerShell 5.1, no dev
tooling). The run stops at the first failure, so exactly one failure is the
subject; everything after it is unexercised. The deliverable is: diagnosis
grounded in evidence, a root-cause fix with an executed regression guard, a
green PR, and a forward audit of the never-yet-exercised steps behind the
failure point.

## Ground rules

- The USB (usually `I:\`, folder `BellField-GateDay-*`) is **read-only
  evidence**. Never write to it.
- Never echo token/credential material from evidence into chat, commits, or PR
  bodies. Evidence is pre-redacted, but treat raw sidecars carefully; report
  secret-shaped content by file/length/shape only.
- Do not trust the report's interpretation of the failure — trust its facts,
  then verify the interpretation against JSONL timestamps, sidecars, and code.
- Main is branch-protected: never commit to main; PRs require the `quality`
  check. Use the full path to gh in Bash:
  `"C:/Program Files/GitHub CLI/gh.exe"`.

## Step 1 — Catch up and locate evidence

1. `git fetch origin main`; note recent merged PRs and the current main commit.
2. Find the newest `*rerun-N*` files on the USB. Primary artifacts:
   - `evidence\gate-day-<date>-rerun-N.md` — the operator report (final
     status, last completed gate, first failing step).
   - `evidence\gate-day-admin-runner-rerun-N.jsonl` — runner event log.
   - `evidence\gate-day-admin-runner-rerun-N-output\*.stdout/stderr.txt` —
     per-step child output sidecars. **The real error is usually here**, even
     when higher-level summaries only say "exited with 1".
   - Gate 3: `gate3-update-durable-rerun-N-*.jsonl` (updater phases),
     `gate3-update-failure-summary-rerun-N.json`.
   - `command-log-rerun-N.txt` — operator command transcript.
3. Confirm the report's "Expected source commit" against main history — know
   exactly which code ran.

## Step 2 — Reconstruct the timeline before theorizing

Dump the JSONL as `timestamp | event | step | status` and compute durations.
Check three clocks before anything else:

- **Heartbeats**: long-running steps emit 15s `progress` events. Regular =
  machine healthy; gaps = stall.
- **Timeout honesty**: `-StepTimeoutSeconds` (default 1800) is polled every
  500ms. A timeout that fired late by minutes means the runner itself was not
  being scheduled — machine suspension, not product hang. Look for
  `system-stall-detected` events (poll gap ≥10s) and
  `BELLFIELD_GATE_ADMIN_POWER` keep-awake events.
- **Step duration vs known baseline**: compare against the same step in prior
  passing reruns (prior evidence stays on the USB).

Then read the failing step's stderr/stdout sidecars in full.

## Step 3 — Triage against the known bug classes

History of this harness (see `docs/` smoke reports and
`project-gate-day-regression-lessons` memory). Match signatures first:

| Signature                                                             | Likely class                                                                                                                                | Reference fix                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `exitCodeUnknown=True` on a healthy child                             | WinPS 5.1 `Start-Process` loses ExitCode unless `$process.Handle` is cached                                                                 | PR #85/#87                                         |
| `Join-Path ... empty string`; a variable is empty that "can't be"     | Dot-sourcing a script with a top-level `param()` block rebinds caller variables                                                             | PR #87 (split param-less `-functions.ps1` library) |
| Runner expects a `BELLFIELD_*` sentinel line the helper never printed | Wrapper consumed the inner CLI's sentinel without re-emitting                                                                               | PR #88                                             |
| Timeout fired late; silent step that is normally fast                 | Machine slept/Modern Standby mid-step                                                                                                       | PR #89 (keep-awake, stall events)                  |
| `ECONNREFUSED` right after a service reports Running                  | Service state ≠ usable; postgres binds port after recovery                                                                                  | PR #90 (pg_isready readiness proof)                |
| Step passed in old reruns, fails now                                  | Ask: has this step **ever** executed through the _current code path_ on real hardware? Manual-route passes do not validate the runner route | all of the above                                   |

If none match, treat it as a new class: reproduce the mechanism locally under
`powershell.exe` (WinPS 5.1, not pwsh) with a minimal probe before writing the
fix, and add the class to this table afterward.

## Step 4 — Fix conventions

- Branch from fresh `origin/main` (`git checkout -b fix/<slug>`), never main.
- Fix the **root cause once**, in the shared helper — not per-step
  whack-a-mole (`AllowUnknownExitCode` history is the cautionary tale).
- Regression guards must **execute the real code path**. String-content checks
  (`content.includes(...)`) have let three of these classes through CI. The
  established patterns in `tools/smoke/install-helper-smoke.mjs`: PowerShell
  corpus probes under `powershell.exe`, stub release trees running real
  helpers, extracting real runner functions and running them against real
  output.
- When the failure was hard to read from evidence, also fix the evidence:
  capture child output into failure events (redacted via
  `sensitive-redaction.mjs` / `evidence-redaction.ps1`), name the actual
  failing phase, add heartbeats. Note: token redaction is deliberately
  same-line-only — a bare "setup token:" line must not consume the next line
  (guarded by the redaction JSON corpus).
- Sync operator docs when behavior changes: `docs/install-runbook.md`,
  `docs/gate-day-checklist.md`.
- Test fixtures with credential-shaped strings must be built with
  `.join('')` concatenation or secretlint fails CI.

## Step 5 — Validation battery (all must pass locally)

```powershell
corepack pnpm test:tools
corepack pnpm smoke:install-helpers
corepack pnpm smoke:gate-day-admin
corepack pnpm format:check     # prettier --write new files first
corepack pnpm security:secrets
```

Add `smoke:service-manifests` / `smoke:updater` / `smoke:release-zip` when the
touched files feed them. If the fix is PowerShell-behavioral, prove it live
under `powershell.exe` with a scratchpad probe and put the numbers in the PR.
Clean up any `C:\BellField` residue a local probe creates (inspect before
deleting).

## Step 6 — PR and ship

- Title: `<imperative fix summary> (rerun-N blocker)`.
- Body sections: Root cause (with the evidence chain), Fix, Regression guard,
  Verification, `Rerun-N+1 notes` (machine cleanup list, operator prep).
- Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
  commits end with the Claude Co-Authored-By line.
- Watch CI in the background (`gh pr checks <n> --watch` with
  `run_in_background`), report the result; merge with `--merge` (repo uses
  merge commits) when the user approves.
- After merge remind: rebuild the USB from the new main commit, and reset the
  scratch machine (uninstall any registered bellfield-_ services, delete
  `C:\BellField` and any `C:\BellField-update-_` roots, keep the power plan at
  never-sleep-plugged-in).

## Step 7 — Look forward

The strict run hides everything past the failure point. Before finishing,
audit the next unexercised steps for the same class you just fixed (argument
contracts, stdout parsing, service readiness, never-run-through-runner code),
and tell the user what the next run's frontier and residual risks are. Update
the `project-gate-day-regression-lessons` memory and the table in Step 3 with
any new class.
