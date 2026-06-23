# Release USB Preflight Checklist

Use this on the dev machine before a gate-day USB leaves the desk. The goal is
to prove the release artifacts are reproducible, signed, self-contained enough
for a clean Windows machine, and not mixed with stale evidence.

Audience: this is for the Codex/operator preparing the USB, not for the Codex
running the clean-machine gate. The clean-machine Codex should treat the
completed checkoff as read-only provenance, then follow `START-HERE.txt`,
`gate-day-checklist.md`, and the runbooks for the actual scratch-machine work.

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

- [ ] Source-level gates passed once for the final source commit that will be
      used for both active artifacts. These do not need to be repeated after
      artifact B when the source commit has not changed:

  ```powershell
  pnpm smoke:install-helpers
  pnpm smoke:install-config
  pnpm smoke:service-manifests
  pnpm format:check
  git diff --check
  pnpm security:secrets
  ```

- [ ] Required GitHub checks are green for that same source commit:
      `quality` and `install-helper-smoke`. The helper-smoke check must run on
      `windows-latest` with `BELLFIELD_REQUIRE_POWERSHELL_CORPUS=1`, so the
      PowerShell redaction/env-line/firewall corpora cannot silently skip.

- [ ] Artifact A was built from a clean tree, packaged with the release ZIP
      helper, and smoke-tested as an extracted ZIP:

  ```powershell
  pnpm build:release `
    --version=<A> `
    --release-date=<YYYY-MM-DD> `
    --postgres-root=<path-to-PG16-x64-root> `
    --vc-redist-root=<path-to-VC-redist-x64-root> `
    --winsw-exe=<path-to-approved-WinSW-x64.exe>
  pnpm smoke:release-build -- --require-gate-day-deps=true
  pnpm package:release-zip -- --release-root=release --output=<artifact-A.zip>
  pnpm smoke:release-zip -- --zip=<artifact-A.zip> --require-gate-day-deps=true
  ```

- [ ] Artifact B was built after A, from the same clean source commit unless the
      update scenario intentionally tests a later commit. Repeat the artifact
      commands above with version B and `<artifact-B.zip>`; do not rerun the
      source-level gates unless source files changed after artifact A.
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
- [ ] `pnpm smoke:install-helpers` passed and proves the packaged baseline,
      service, LAN, migration, and evidence-redaction helpers are present and
      wired into the installer failure path. After rerun #10, this smoke must
      also prove LAN configurator/collector firewall effectiveness checks use
      `Get-NetFirewallAddressFilter` for `RemoteAddress`, not
      `Get-NetFirewallPortFilter`.
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
- [ ] Any doc/checklist edits made during prep were included before the final
      source-level `pnpm format:check` and `git diff --check` runs.

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
- [ ] Failed or superseded artifacts are either under a clearly named USB
      archive folder, for example `artifacts/failed-run-YYYYMMDD/`, or removed
      from the USB after durable repo/dev-machine evidence exists. If they are
      removed to save space, record that choice in the preflight checkoff.
- [ ] Build evidence for active artifacts is in `build-evidence/`.
- [ ] Build evidence for failed or superseded artifacts is archived separately
      when kept on the USB; otherwise the durable repo/dev-machine evidence path
      is recorded in the preflight checkoff.
- [ ] A completed preflight checkoff exists at
      `build-evidence/preflight-checkoff-rerun-<N>-<YYYY-MM-DD>.md`, based on
      [release-usb-preflight-checkoff-template.md](./release-usb-preflight-checkoff-template.md).
- [ ] Rerun evidence files are fresh and do not overwrite earlier failure
      evidence.
- [ ] Active rerun evidence templates have their top-level status/checklist
      updated during the run, not only appended closeout notes at the bottom.
- [ ] Current-run evidence files under `evidence/` are treated as mutable
      operator logs and are intentionally excluded from `SHA256SUMS.txt`.
      Rerun #8 showed that hashing the active evidence files can falsely block
      the install before extraction after the operator writes the run notes.
- [ ] Offline docs on the USB were refreshed from the repo after the final doc
      edits.
- [ ] Every `docs\*.md` path referenced by `START-HERE.txt` or active evidence
      templates exists on the USB.
- [ ] `SHA256SUMS.txt` was regenerated after the final immutable USB change,
      excluding `evidence/**` and `private-relay-config/**`.
- [ ] Windows-side hash verification normalizes artifact relative paths to
      forward slashes before matching `SHA256SUMS.txt`. Rerun #7 showed that a
      literal backslash-vs-forward-slash comparison can falsely report blank
      expected hashes for valid artifacts.
      Prefer the packaged helper:

  ```powershell
  .\tools\install\verify-usb-hashes.ps1 -Root <usb-root>
  ```

## Secret Hygiene

- [ ] Relay token values appear only in the private relay config location.
- [ ] Gate-day relay private config supplies only `BELLFIELD_RELAY_BASE_URL`
      and `BELLFIELD_RELAY_TOKEN`; it must not overwrite the locally generated
      `BELLFIELD_RELAY_SERVER_INSTANCE_ID`.
- [ ] The clean-install gate does not require copying relay base URL/token
      before first-owner setup. If services only start after relay credentials
      are pasted, the artifact has failed Gate 1.
- [ ] The USB includes the packaged install helpers under `tools\install`,
      including `collect-windows-install-baseline.ps1`,
      `collect-windows-service-evidence.ps1`,
      `configure-windows-lan-access.ps1`,
      `remove-windows-lan-access.ps1`,
      `collect-windows-lan-evidence.ps1`, `run-packaged-migrations.mjs`, and
      `evidence-redaction.ps1` / `sensitive-redaction.mjs`.
- [ ] Docs, `START-HERE.txt`, evidence templates, command logs, and build
      evidence do not contain live relay token values or first-owner setup token
      values.
- [ ] Evidence files use the packaged collectors for baseline/service/LAN
      capture. The collectors redact relay token values, `DATABASE_URL`, media
      token secrets, `PGPASSWORD`, libpq keyword-form `password=...`,
      first-owner setup token values, session/setup/password JSON fields,
      bearer-looking relay/token values, and private-key-looking blocks before
      writing JSON/stdout. Broad `token=...` and `password=...` redaction is
      intentional for shareable evidence, even when a particular string is
      benign.

Useful scan:

```powershell
rg -n "bfrt1_[A-Za-z0-9]|BELLFIELD_RELAY_TOKEN=[^C\r\n]|BellField first-owner setup token: [A-Za-z0-9_-]+\.|BEGIN (RSA|OPENSSH|PRIVATE)" `
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

- [ ] Record the active artifact versions, source commit, PR/merge commit,
      smoke evidence files, SHA256 entries, USB hash verification summary,
      secret-scan result, cleanup/temp-process checks, and any deliberately
      skipped or changed checklist item in the preflight checkoff.
- [ ] Do not start the clean-machine gate until every unchecked item is either
      completed or deliberately marked as a known risk in the preflight
      checkoff, with a final ready/not-ready verdict.
