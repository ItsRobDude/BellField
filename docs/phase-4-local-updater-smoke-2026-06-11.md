# Phase 4 Local Updater Smoke - 2026-06-11

This is evidence for the repo-side update-channel primitive. It is not a clean-machine or real-service update gate.

## What This Proves

- Release assembly stamps `bellfield-build-manifest.json` with version, release date, generated time, source commit, and `licenseRequired=true`.
- Release assembly writes `bellfield-update-manifest.json` and `bellfield-update-signature.json`.
- The update manifest verifies with the embedded release public key.
- Tampering with a signed file is rejected.
- A release dated after the license `updateWindowEnd` is rejected.
- The updater can verify a signed update artifact, verify the installed license, stage-copy the new release, swap it into a scratch current-release directory, run packaged migrations, and preserve the old release as a rollback directory.
- The packaged release includes:
  - `tools/install/update-bellfield.mjs`
  - `tools/update/release-artifact.mjs`
  - `tools/update/license-verification.mjs`
  - `apps/worker/dist/jobs/backup/run-backup-cli.js`

## Commands Run

```powershell
pnpm --filter @bellfield/worker test
pnpm smoke:release-artifact
pnpm smoke:updater
pnpm build:release
node -e "import('./tools/update/release-artifact.mjs').then(({verifyReleaseArtifact})=>{const m=verifyReleaseArtifact({releaseRoot:'release'}); console.log(JSON.stringify({version:m.build.version,releaseDate:m.build.releaseDate,files:m.files.length}, null, 2));})"
```

Observed packaged-release verification:

```json
{
  "version": "0.0.1",
  "releaseDate": "2026-06-11",
  "files": 59123
}
```

## Local Key Material

Release artifact signing uses a separate Ed25519 keypair from the runtime license key.

Private key, outside the repo:

```text
C:\Users\rober\Documents\API Keys\BellField\release-v1\bellfield-release-private-key.pem
```

Public key, embedded in source:

```text
tools/update/release-artifact.mjs
```

## Boundaries

- `pnpm smoke:updater` uses scratch directories and passes `--skip-services=true --skip-health=true --skip-backup=true`.
- The scratch updater smoke does not stop real Windows services.
- The scratch updater smoke does not run real `pg_dump`.
- The hard-fail pre-update backup path is covered by worker tests using a fake process runner, and packaged as `run-backup-cli.js`, but has not been proven against the host PostgreSQL tools in a real installed update.
- The Phase 4 gate remains open until an installed v(N) machine updates to v(N+1) through the updater, with services and a real pre-update backup, and refuses a build dated beyond the installed license window.
