# Phase 3 Local License Smoke - 2026-06-11

This records the strongest nondestructive Phase 3 validation run on the available Windows development PC.

It is evidence for the repo-side licensing primitive. It is not a clean-machine sold-install gate and it is not the Phase 4 updater entitlement gate.

## Machine Boundary

Available:

- repo checkout with dev tools
- generated `release/` artifact from `pnpm build:release`
- ignored `.codex-smoke` scratch directory for throwaway signing material
- local BellField v1 signing key under `C:\Users\rober\Documents\API Keys\BellField\license-v1`

Not used:

- clean Windows install machine
- Windows service registration/reboot
- real `pg_dump` / `pg_restore` backup and restore drill
- Phase 4 updater
- Phase 5 relay

## What Passed

- `pnpm test`
  - API license verifier matrix: valid, missing, tampered, expired update window, future-dated, and required-missing startup error
  - System diagnostics and support export include license status/config without secrets
  - office System surface renders the License card
  - worker backup service copies the configured license file into the backup set manifest
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm check:architecture`
- `pnpm check:ui-copy`
- `git diff --check`
- `pnpm build:release`
- `pnpm smoke:license-key`

Issuance tooling smoke passed with throwaway keys under `.codex-smoke`:

```powershell
node tools/license/generate-keypair.mjs --output-dir=.codex-smoke\phase3-license --force=true
node tools/license/issue-license.mjs --private-key=.codex-smoke\phase3-license\bellfield-license-private-key.pem --license-id=lic_smoke_20260611 --shop-name="Phase 3 Smoke Shop" --issued-at=2026-06-11T00:00:00.000Z --update-window-end=2027-06-11 --output=.codex-smoke\phase3-license\bellfield-license.json --ledger=.codex-smoke\phase3-license\issued-licenses.jsonl --force=true
```

Restore-helper missing-license refusal passed:

```text
restore_missing_license_refusal=true
```

Local v1 key smoke passed:

- issued a temporary license using `C:\Users\rober\Documents\API Keys\BellField\license-v1\bellfield-license-private-key.pem`
- verified that license against the public key embedded in `apps/api/src/modules/licensing/license-verification.ts`

Release build-manifest behavior is now covered by API runtime-config tests:

- a release manifest with `licenseRequired: true` forces license-required runtime even when `BELLFIELD_LICENSE_REQUIRED=false`
- source/dev runs without a build manifest remain unlicensed by default

Release artifact spot checks passed:

- `release/apps/api/dist/apps/api/src/modules/licensing/license-verification.js` exists
- `release/apps/api/bellfield-build-manifest.json` exists and requires a license
- `release/tools/license/issue-license.mjs` does not exist
- `release/bellfield-server.env.example` includes:

```text
BELLFIELD_LICENSE_REQUIRED=true
BELLFIELD_LICENSE_PATH=C:\BellField\data\license\bellfield-license.json
```

## Not Proven

- clean-machine sold-shaped install with a real BellField-issued license
- API process boot from the compiled release with a BellField-issued license and real database on a clean install
- real worker-produced `pg_dump` backup that includes the license file
- full restore with database, media, and license onto a scratch/replacement machine
- update entitlement enforcement against `updateWindowEnd`
- relay-token issuance or relay-side single-active enforcement

Those remain Phase 3/4/5 gates or scratch-machine validation work, not blockers for continuing repo-side implementation.
