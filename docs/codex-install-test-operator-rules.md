# Codex Install Test Operator Rules

Use this when Codex is helping run a BellField clean Windows install, restore,
update, or relay smoke from a prepared USB package.

The goal is to test the package and runbooks as a customer-style install. Do
not quietly turn the scratch machine into a developer workstation to get past a
blocked step.

## Read Order

1. `START-HERE.txt` on the USB.
2. `docs/gate-day-checklist.md`.
3. `docs/install-runbook.md`.
4. `docs/restore-runbook.md`.
5. This document.

## Hard Rules

- Use the clean-install artifact named by `START-HERE.txt` for Gate 1.
- Use the update artifact named by `START-HERE.txt` only for the update gate.
- Use only the packaged BellField runtime/tooling from the ZIP and Windows
  built-ins.
- Do not install Git, Node.js, pnpm, PostgreSQL, Docker, VS Code, SDKs,
  database admin tools, or other developer tooling.
- Do not patch, rebuild, unzip-edit, or replace files inside the release
  artifact on the scratch machine.
- Do not browse the repo or internet for missing product files during the gate.
  Missing package content is a gate failure or blocker, not a reason to
  improvise.
- If extra tooling or artifact surgery becomes necessary, stop and record the
  run as contaminated or diagnostic only.

## Evidence Rules

- Record run notes in the active rerun evidence file named by
  `START-HERE.txt`.
- Record non-secret command output in the active command log named by
  `START-HERE.txt`.
- Include exact commands, exit codes, visible errors, service status readbacks,
  paths, and timestamps when useful.
- Never record setup tokens, relay tokens, database passwords, generated server
  secrets, private keys, or full customer acceptance URLs.
- If a command prints a secret, redact the secret and note that it was redacted.
- Photos or screenshots are useful when the screen state matters, but copy the
  relevant error text into the evidence file too.

## Relay Config Rules

- Copy only `BELLFIELD_RELAY_BASE_URL` and `BELLFIELD_RELAY_TOKEN` from the USB
  private relay config into `C:\BellField\bellfield-server.env`.
- Preserve the locally generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID` created
  by `write-server-config.mjs`.
- Do not copy relay host/provider secrets to the scratch machine.
- Do not paste relay token values into evidence or chat.

## When To Stop

Stop and mark the gate blocked or failed when:

- a referenced USB file is missing;
- an active artifact hash does not match `SHA256SUMS.txt`;
- a packaged executable, DLL, service manifest, migration, or runtime
  dependency is missing;
- Windows requires installing developer tooling to continue;
- the runbook path is unclear enough that a real customer/operator would be
  stuck;
- service identity, ACL, or reboot-survival checks fail;
- a step would require recording a secret in evidence.

When stopping, capture the shortest reproducible failure path and leave the
machine state as intact as practical for follow-up inspection.
