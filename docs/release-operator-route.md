# Release Operator Route

This is the separate route for producing and publishing BellField release
artifacts. It is deliberately separate from
[testing-relay-ops.md](./testing-relay-ops.md) because the current laptop relay
is a testing host, not the permanent release infrastructure.

## Credential Locations

Do not commit private keys, issued relay tokens, or provider keys.

- License private key:
  `C:\Users\rober\Documents\API Keys\BellField\license-v1\bellfield-license-private-key.pem`
- Release private key:
  `C:\Users\rober\Documents\API Keys\BellField\release-v1\bellfield-release-private-key.pem`
- Public keys may be committed when they are the intended verification keys.
- Relay shop tokens are one-time plaintext outputs from the relay admin CLI;
  store them only in the owner secrets folder or the target install's
  protected environment file.

## Build A Sold-Shaped Release

From the repo root on the dev PC:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:architecture
pnpm check:ui-copy
pnpm build:release `
  --version=<version> `
  --release-date=<YYYY-MM-DD> `
  --postgres-root=<path-to-PG16-x64-root> `
  --vc-redist-root=<path-to-VC-redist-x64-root> `
  --winsw-exe=<path-to-approved-WinSW-x64.exe>
pnpm smoke:release-build -- --require-gate-day-deps=true
pnpm package:release-zip -- --release-root=release --output=bellfield-<version>.zip
pnpm smoke:release-zip -- --zip=bellfield-<version>.zip --require-gate-day-deps=true
```

The release builder uses the release signing key path configured in
`tools/update/release-artifact.mjs`, currently under the owner's API Keys
folder. The generated `release/` folder is ignored by git. Build compilation,
production dependency deployment, and signing run in a disposable detached
worktree at the current clean commit; only the finished release tree is copied
back to this checkout.

The PostgreSQL and WinSW inputs are copied into `release/` before the signed
update manifest is written. Do not manually copy or replace files after
`build:release`; post-sign edits invalidate the artifact hashes.

Before publishing, package the verified release folder with
`pnpm package:release-zip` and keep the signed manifest/artifact files
together. `pnpm smoke:release-zip` must pass against the final ZIP, because it
extracts the artifact the same way the Windows operator path does and then
validates API/worker dependencies, office-web startup, and packaged
PostgreSQL/migrations. Gate-day still owns the clean-machine proof that a
stranger can install, update, restore, and send through the relay.

## Publish Through A Relay

This is the release-distribution route. It may use the testing relay while that
is the only BellField relay, but the route itself should move unchanged to a
permanent host later.

1. Copy the zip under the relay artifacts root:

   ```powershell
   scp -i "$env:USERPROFILE\.ssh\bellfield-relay-operator" .\bellfield-<version>.zip `
     rob@192.168.50.243:/home/rob/bellfield/deploy/relay/artifacts/
   ```

2. Publish the artifact in the relay database:

   ```bash
   cd /home/rob/bellfield/deploy/relay
   docker compose --env-file relay-host.env exec relay \
     node dist/apps/relay/src/cli/relay-admin.js publish-release \
       --file=bellfield-<version>.zip \
       --version=<version> \
       --release-date=<YYYY-MM-DD>
   ```

3. Verify from a licensed install or with a valid relay token:

   ```powershell
   Invoke-RestMethod https://relay.bellfield.app/v1/releases `
     -Headers @{ Authorization = "Bearer <relay-token>" }
   ```

The relay enforces update-window entitlement when listing and downloading
release artifacts. The offline license remains the right-to-run proof; the
relay token is only the online distribution/delivery credential.

## Permanent Relay Cutover Criteria

Do not call the current laptop route permanent until these are true on the new
host:

- dedicated host or VPS with no gate-day dual use
- key-only SSH and no broad owner convenience sudo unless explicitly justified
- firewall policy documented and verified
- off-box backups with restore readback
- external uptime monitoring
- documented operator runbook for deploy, release publishing, backup restore,
  token issuance, token revocation, and host replacement
