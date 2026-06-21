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
  pnpm smoke:service-manifests
  pnpm smoke:release-build -- --require-gate-day-deps=true
  pnpm package:release-zip -- --release-root=release --output=<artifact-A.zip>
  pnpm smoke:release-zip -- --zip=<artifact-A.zip> --require-gate-day-deps=true
  ```

- [ ] Artifact B was built after A, from the same clean source commit unless the
      update scenario intentionally tests a later commit.
- [ ] Each active artifact ZIP was created with `pnpm package:release-zip`;
      do not use an ad hoc manual ZIP command for gate-day artifacts.
- [ ] `pnpm smoke:release-zip -- --zip=<artifact.zip> --require-gate-day-deps=true`
      passed for each active artifact. This smoke extracts with the Windows
      operator path, verifies API/worker dependency resolution, boots
      office-web from the extracted ZIP, fetches root HTML and referenced
      Next static JavaScript assets, runs packaged migrations against a
      temporary packaged PostgreSQL database, issues a smoke license, runs the
      packaged manual backup CLI, boots API through `/health`, proves
      invalid-token first-owner handling, creates the first owner, verifies the
      owner session, and confirms the worker stays alive after startup.
- [ ] CI ran the API identity-attempt PostgreSQL regression against a real
      Postgres service. Do not rely only on mocked repository tests for the
      failed-attempt throttle SQL.
- [ ] `pnpm smoke:install-config` passed and proves the real
      `write-server-config.mjs` output is accepted by API and worker with relay
      disabled.
- [ ] `pnpm smoke:service-manifests` passed and confirms
      `bellfield-postgres.xml` does not contain `<serviceaccount>`, the service
      log paths remain outside the manifest directory, and
      `install-windows-services.ps1` configures and reads back the SCM
      `StartName` before service startup, validates runtime config, waits for
      service/process-id stability, and polls API health.
- [ ] The artifact's relay-disabled clean-install config is internally
      consistent. The accepted disabled-relay state is a generated
      `BELLFIELD_RELAY_SERVER_INSTANCE_ID` with empty
      `BELLFIELD_RELAY_BASE_URL` and `BELLFIELD_RELAY_TOKEN`; services must not
      require relay credentials before first-owner setup.
- [ ] Service-account changes are not considered proven by XML inspection
      alone. If this USB is meant to close a Windows service-identity blocker,
      the release/install code must assert the installed SCM `StartName` before
      service startup, and the clean-machine run must capture that readback.
      If no Windows SCM readback has passed yet, the PR/release notes must call
      out that the proof is still pending.
- [ ] If this USB is meant to close the service-identity blocker, a passing
      elevated diagnostic JSON from
      `tools\install\diagnose-windows-service-account.ps1` exists for the same
      WinSW binary that was packaged. This diagnostic is not a Gate 1 pass; it
      only proves the chosen account path before rebuilding and hashing USB
      artifacts. The default diagnostic run should clean up after itself; use
      `-KeepArtifacts` only for an explicitly diagnostic residue-preserving
      run. Rerun #5 showed that a useful diagnostic must not reject the
      preferred virtual-account path solely because `whoami /groups` omits the
      service-specific SID when `whoami /user` is already the service virtual
      account and the SID-only ACL write succeeds.
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
- [ ] After extraction, top-level runtime dependencies are resolvable from
      `release/apps/api/node_modules`, `release/apps/worker/node_modules`, and
      the office-web standalone server root; do not rely on a `.pnpm` store
      existing without the top-level package entries Node needs.
- [ ] After extraction, the full `release/` tree contains no symlinks,
      junctions, or Windows reparse points.

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
- [ ] Active rerun evidence templates have their top-level status/checklist
      updated during the run, not only appended closeout notes at the bottom.
- [ ] Offline docs on the USB were refreshed from the repo after the final doc
      edits.
- [ ] Every `docs\*.md` path referenced by `START-HERE.txt` or active evidence
      templates exists on the USB.
- [ ] `SHA256SUMS.txt` was regenerated after the final USB change.
- [ ] Windows-side hash verification normalizes artifact relative paths to
      forward slashes before matching `SHA256SUMS.txt`. Rerun #7 showed that a
      literal backslash-vs-forward-slash comparison can falsely report blank
      expected hashes for valid artifacts.
      Prefer the packaged helper:

  ```powershell
  .\release\tools\install\verify-usb-hashes.ps1 -Root <usb-root>
  ```

## Secret Hygiene

- [ ] Relay token values appear only in the private relay config location.
- [ ] Gate-day relay private config supplies only `BELLFIELD_RELAY_BASE_URL`
      and `BELLFIELD_RELAY_TOKEN`; it must not overwrite the locally generated
      `BELLFIELD_RELAY_SERVER_INSTANCE_ID`.
- [ ] The clean-install gate does not require copying relay base URL/token
      before first-owner setup. If services only start after relay credentials
      are pasted, the artifact has failed Gate 1.
- [ ] The USB includes `tools\install\collect-windows-service-evidence.ps1` in
      the release tree, and the evidence instructions use it for elevated
      service/log/ACL readback.
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
- [ ] No `bellfield-release-zip-smoke-*` or
      `bellfield-release-migration-smoke-*` temp directory remains.
- [ ] No office-web/Next server process remains from release ZIP smoke.
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
