# Release USB Preflight Checklist

Use this on the dev machine before a gate-day USB leaves the desk. The goal is
to prove the release artifacts are reproducible, signed, self-contained enough
for a clean Windows machine, and not mixed with stale evidence.

This checklist complements [gate-day-checklist.md](./gate-day-checklist.md). It
does not replace the clean-machine run.

## Source Provenance

- [ ] `git status --short --branch` shows a clean tree before `pnpm build:release`.
- [ ] The release source commit is committed locally.
- [ ] The release source commit is pushed, or the PR/branch carrying it is
      clearly recorded before the USB is used outside the dev machine.
- [ ] Each artifact's `bellfield-build-manifest.json` `sourceCommit` matches:

  ```powershell
  git rev-parse --short HEAD
  ```

- [ ] `pnpm build:release` was not run with `--allow-dirty=true` except for an
      explicitly labeled diagnostic artifact.

## Release Inputs

- [ ] PostgreSQL input is a root directory, not only `bin`.
- [ ] PostgreSQL input contains `bin`, `lib`, `share`, and `share/postgres.bki`.
- [ ] PostgreSQL input contains required tools: `postgres`, `pg_ctl`, `initdb`,
      `psql`, `pg_dump`, `pg_restore`, `createdb`, and `dropdb`.
- [ ] Windows release builds pass `--vc-redist-root=<x64 VC redist root>`.
- [ ] The VC redist root contains `vcruntime140.dll`, `vcruntime140_1.dll`, and
      `msvcp140.dll`.
- [ ] WinSW input points at the approved x64 executable.

## Build Commands

- [ ] Artifact A was built from a clean tree:

  ```powershell
  pnpm build:release `
    --version=<A> `
    --release-date=<YYYY-MM-DD> `
    --postgres-root=<path-to-PG16-x64-root> `
    --vc-redist-root=<path-to-VC-redist-x64-root> `
    --winsw-exe=<path-to-approved-WinSW-x64.exe>
  pnpm smoke:release-build -- --require-gate-day-deps=true
  ```

- [ ] Artifact B was built after A, from the same clean source commit unless the
      update scenario intentionally tests a later commit.
- [ ] `pnpm smoke:release-office-web` passed against the final release tree.
- [ ] `pnpm format:check` passed after any doc/checklist updates.

## Artifact Contents

For each active release zip:

- [ ] The zip contains `release/bellfield-build-manifest.json`.
- [ ] The zip contains `release/bellfield-update-manifest.json`.
- [ ] The zip contains `release/bellfield-update-signature.json`.
- [ ] The zip contains `release/runtime/node/node.exe`.
- [ ] The zip contains `release/postgres/bin/postgres.exe`.
- [ ] The zip contains `release/postgres/lib`.
- [ ] The zip contains `release/postgres/share/postgres.bki`.
- [ ] The zip contains app-local VC++ runtime DLLs:
      `release/postgres/bin/vcruntime140.dll`,
      `release/postgres/bin/vcruntime140_1.dll`, and
      `release/postgres/bin/msvcp140.dll`.
- [ ] The zip contains `release/tools/winsw/WinSW-x64.exe`.

## USB Layout

- [ ] `START-HERE.txt` names the active clean-install artifact.
- [ ] `START-HERE.txt` names the active update artifact.
- [ ] The main `artifacts/` folder contains only active artifacts.
- [ ] Failed or superseded artifacts are under a clearly named archive folder,
      for example `artifacts/failed-run-YYYYMMDD/`.
- [ ] Build evidence for active artifacts is in `build-evidence/`.
- [ ] Build evidence for failed or superseded artifacts is archived separately.
- [ ] Rerun evidence files are fresh and do not overwrite earlier failure
      evidence.
- [ ] Offline docs on the USB were refreshed from the repo after the final doc
      edits.
- [ ] `SHA256SUMS.txt` was regenerated after the final USB change.

## Secret Hygiene

- [ ] Relay token values appear only in the private relay config location.
- [ ] Docs, `START-HERE.txt`, evidence templates, command logs, and build
      evidence do not contain live relay token values.
- [ ] Evidence files instruct the operator to redact relay token values.

Useful scan:

```powershell
rg -n "bfrt1_[A-Za-z0-9]|BELLFIELD_RELAY_TOKEN=[^C\r\n]|BEGIN (RSA|OPENSSH|PRIVATE)" `
  docs tools <usb-root>\START-HERE.txt <usb-root>\docs <usb-root>\evidence `
  -g "!private-relay-config/**"
```

## Cleanup

- [ ] No packaged PostgreSQL process remains from release smoke.
- [ ] No `bellfield-release-postgres-smoke-*` temp directory remains.
- [ ] No malformed local path artifacts, such as accidental semicolon-suffixed
      directories, were created during packaging.
- [ ] The USB can be removed and reinserted, and `START-HERE.txt`,
      `SHA256SUMS.txt`, active artifacts, licenses, docs, and evidence templates
      are still readable.

## Closeout

- [ ] Record the active artifact versions, source commit, smoke evidence files,
      and SHA256 entries in the PR or release notes.
- [ ] Do not start the clean-machine gate until every unchecked item is either
      completed or deliberately marked as a known risk.
