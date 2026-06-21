# Codex Install Test Operator Rules

Use this when Codex is helping run a BellField clean Windows install, restore,
update, or relay smoke from a prepared USB package.

This document is not the install recipe. It is the operating contract for the
Codex instance on the scratch machine: how to preserve the value of the test,
what counts as contamination, what evidence to capture, and when to stop
instead of improvising.

## Mission

Prove whether a prepared BellField USB package can be used by an operator on a
plain Windows machine without developer tooling or hidden repo context.

The runbooks are being tested as much as the software. A missing file, unclear
step, bad hash, service failure, or need for extra tooling is evidence. Do not
smooth it over.

## Read Order

Read these from the USB before installing anything:

1. `START-HERE.txt`.
2. `docs/codex-install-test-operator-rules.md`.
3. `docs/gate-day-checklist.md`.
4. `docs/install-runbook.md`.
5. `docs/restore-runbook.md`.

If a referenced file is missing, stop before install work begins and record the
USB package as blocked.

## Roles

The human operator owns physical actions: inserting the USB, approving elevated
PowerShell prompts, rebooting the machine, using a second device, and deciding
whether to continue after a blocked or contaminated run.

Codex owns procedural discipline: reading the runbooks, running Windows
built-in commands, using only packaged BellField tooling, capturing evidence,
and calling out ambiguity instead of inventing a path.

Codex must not silently substitute a developer workflow for the customer-style
workflow. The point is to learn whether the packaged path works.

## Allowed Tools

Allowed on the scratch machine:

- Windows built-ins: File Explorer, PowerShell, `cmd.exe`, Services, Event
  Viewer, browser, `certutil`, `Get-FileHash`, `icacls`, `sc.exe`,
  `Get-CimInstance`, `Invoke-RestMethod`, and similar built-in diagnostics.
- BellField tools contained inside the active release ZIP, especially
  `release\runtime\node\node.exe` and scripts under `release\tools`.
- The prepared USB files: artifacts, licenses, docs, evidence templates, build
  evidence, and private relay config.
- Codex itself as the note-taking and command-running assistant.

Not allowed unless the run is explicitly reclassified as diagnostic:

- Git.
- Node.js, pnpm, npm, yarn, or bun installed on the machine.
- PostgreSQL installed outside the BellField package.
- Docker, VS Code, SDKs, database admin tools, package managers, or build
  tools.
- Downloading missing release files from the repo or internet.
- Editing packaged release files to make the test pass.

## Artifact Rules

- Use the clean-install artifact named by `START-HERE.txt` for Gate 1.
- Use the update artifact named by `START-HERE.txt` only for the update gate.
- Verify active artifact hashes against `SHA256SUMS.txt` before extraction.
- Treat hash mismatch as a stop condition.
- Extract artifacts exactly as the runbook says. Do not recompress, rename
  internals, unzip-edit, copy in missing dependencies, or replace signed files.
- Failed or archived artifacts are evidence only. Do not use them unless the
  current `START-HERE.txt` explicitly says to.

## Execution Style

Move deliberately and keep a command log. Before each major gate, state what is
about to be tested and which runbook section is being followed.

Prefer copyable command blocks from the runbook. If a command must be adapted
for the scratch machine, record the exact adaptation and why it was necessary.

Use full paths when practical. Avoid relying on the current directory for
important install commands.

Do not skip readback checks. Service state, service identity, ACLs, health
responses, backup contents, and update results should be proven with command
output, not assumed from a lack of visible errors.

## Evidence Standard

Record run notes in the active rerun evidence file named by `START-HERE.txt`.
Record non-secret command output in the active command log named by
`START-HERE.txt`.

Good evidence includes:

- timestamped start/stop notes for each gate;
- machine baseline: Windows edition/build, machine name, network state, USB
  drive letter, and prior contamination notes;
- exact command text and exit code when meaningful;
- path readbacks for extracted artifacts, release root, data root, logs,
  licenses, backups, and evidence files;
- service readbacks from `Get-CimInstance Win32_Service`;
- ACL readbacks from `icacls` for env, service, PostgreSQL, data, and log
  paths;
- health responses from `Invoke-RestMethod`;
- browser-visible result summaries for first-owner setup, login, job booking,
  update result, and relay acceptance;
- screenshots or photos when the visual state matters, with the important text
  copied into the evidence file.

Never record:

- first-owner setup token values;
- relay tokens;
- database passwords;
- generated server secrets;
- private keys;
- full customer acceptance URLs;
- license signing keys or relay provider secrets.

If a command prints a secret, redact the value and write that redaction
occurred.

## Relay Config Rules

For the relay gate, copy only these keys from the USB private relay config into
`C:\BellField\bellfield-server.env`:

- `BELLFIELD_RELAY_BASE_URL`
- `BELLFIELD_RELAY_TOKEN`

Preserve the locally generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID` created by
`write-server-config.mjs`.

Do not copy relay base URL/token early just to make Gate 1 services start. A
generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID` with blank relay base URL/token
is the accepted clean-install shape: relay remains disabled until both
activation credentials are present. If a rebuilt artifact rejects that shape,
record it as a product/config regression, not an operator workaround point.

Do not copy relay host/provider secrets to the scratch machine. Do not paste
relay token values into evidence, screenshots, chat, or commit messages.

If the relay config file contains more than the base URL and token, stop and
record the package as unsafe for the intended gate.

## Failure Classification

Use these words consistently in the evidence doc:

- `blocked`: the run cannot start or continue because a required USB file,
  instruction, artifact, license, credential, or physical condition is missing.
- `failed`: the packaged product or documented install path was followed and
  produced an incorrect result.
- `contaminated`: the scratch-machine conditions no longer represent the gate,
  usually because extra tooling was installed, release files were patched, or a
  non-runbook workaround was used.
- `diagnostic`: the operator intentionally continues after blocked, failed, or
  contaminated status to gather more information. Diagnostic findings are
  useful, but they do not count as a passed gate.

Do not relabel a failure as blocked just because the likely fix is obvious.
Capture what happened.

## Stop Conditions

Stop before continuing product validation when:

- a referenced USB file is missing;
- an active artifact hash does not match `SHA256SUMS.txt`;
- a packaged executable, DLL, service manifest, migration, runtime dependency,
  license, or runbook file is missing;
- Windows requires installing developer tooling to continue;
- a command requires changing execution policy beyond the runbook's
  process-scoped allowance;
- service install/start, service identity, ACL, migration, health, reboot
  recovery, backup, restore, update, or relay acceptance checks fail;
- the runbook path is unclear enough that a real customer/operator would be
  stuck;
- a step would require recording a secret in evidence;
- Codex is about to guess at product behavior instead of following a documented
  path.

When stopping, capture the shortest reproducible failure path and leave the
machine state as intact as practical for follow-up inspection.

## Closeout

At the end of a gate or blocked run, write a short closeout in the evidence
file:

- final status: passed, blocked, failed, contaminated, or diagnostic;
- the last completed gate;
- the first blocking or failing command/step;
- files changed on the scratch machine;
- whether services are running or stopped;
- whether the machine was rebooted;
- whether secrets were redacted;
- recommended next action.

If the USB itself was wrong, stop there. Do not proceed with the install until
the USB package is repaired and its hash list regenerated.
