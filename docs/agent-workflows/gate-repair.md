# Gate Day repair

Use this after the user requests a fix for an installer, backup/restore, updater,
or Gate Day harness defect. A repair request can include investigation; use the
[review workflow](./gate-review.md) to establish the evidence before editing.
An existing review-only or docs-only boundary remains in force until the user
expands it. Honor already-authorized delivery or preparation steps without asking
for the same authorization again.

## Bound the correction

Read the relevant route in [AGENTS](../../AGENTS.md) and the owning runbook:
[install](../install-runbook.md), [restore](../restore-runbook.md), or
[Gate Day checklist](../gate-day-checklist.md). Record the exact failing artifact
source and compare it with the current implementation. An older packet may
exercise a bug already fixed on the current branch.

Preserve unrelated work and immutable run evidence. Work on an appropriate
feature branch, following repository naming and branch-protection rules; do not
reset a dirty checkout or commit directly to the default branch. Keep the fix
focused on the first supported failure and directly affected downstream paths.

Reproduce the causal mechanism before adding another special case. For Windows
PowerShell behavior, use `powershell.exe` (5.1), not only `pwsh`. Isolate probes in
disposable scratch paths; never reuse a live install or customer database as a
test fixture. Record when the required platform or artifact is unavailable.

## Implement and prove the real path

Prefer a shared-helper correction to per-step exceptions. In particular, an
unknown exit code must not become unconditional success, and `Running` service
state must not substitute for database/API readiness.

Regression checks should execute the mechanism that failed. Existing examples
in [install-helper-smoke](../../tools/smoke/install-helper-smoke.mjs) and
[gate-day-admin-runner-smoke](../../tools/smoke/gate-day-admin-runner-smoke.mjs)
use PowerShell corpus probes, stub release trees running real helpers, and
runner functions exercised against actual child output. String-presence checks
alone do not prove process capture, quoting, readiness, or scope behavior.

If the error was hard to locate, improve the same failure path's evidence using
the existing redactors and durable logging. Preserve same-line-only token
redaction and parseable JSON; the redaction corpus protects both. Use obviously
synthetic test data and avoid committing credential-shaped fixtures.

Run the focused regression and relevant existing checks from
[package.json](../../package.json). For installer/runner corrections, the usual
set is `pnpm test:tools`, `pnpm smoke:install-helpers`, and
`pnpm smoke:gate-day-admin`; add configuration, service-manifest, updater, or
release-ZIP smoke when the touched path feeds those tools. Complete formatting,
`git diff --check`, and secret scanning for the final change. The
[validation playbook](../validation-playbook.md) owns broader checks.
Report any platform-specific skip explicitly; do not round it up to a pass.

Sync operator instructions when the behavior or command contract changes. Add a
new signature to the shared [review table](./gate-review.md#known-failure-signatures)
only when evidence establishes a distinct reusable lesson; no private assistant
memory is needed for this workflow. Inspect the next unexercised steps for the
same mechanism without starting unrelated fixes.

## Delivery boundary

Report cause, correction, executed regression, exact tested revision or working
tree, and what the next clean-machine run still needs to prove. Keep generated
logs/screenshots in ignored `artifacts/` and commit only useful curated findings
when committing is within the request.

Prepare, push, open a PR, merge, or publish only within the user's requested
delivery scope. Before an authorized merge, verify the required checks on the
exact PR head using current repository requirements; old lists of required
checks are not authority. Describe the final change and evidence without
assistant-specific branding or invented authorship.

USB preparation is a separate side effect, not an automatic consequence of
fixing code. If it was already requested, continue with
[Gate Day preparation](./gate-preparation.md) from the selected corrected source.
Cleanup covers only verified scratch paths and processes created by this work;
never broadly delete install roots or retained failure evidence.
