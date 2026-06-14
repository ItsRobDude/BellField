# BellField License Design

This document pins the Phase 3 licensing primitive and its current v2
compatibility foundation. Legacy `schemaVersion: 1` licenses remain paid
perpetual. The successor `trial | paid | dataOnly` entitlement model, with a
data-only degrade and an opportunistic, fail-open revocation check, is specified
in [license-refund-trial-plan.md](./license-refund-trial-plan.md). That model
preserves every paid invariant below and scopes the new gating to trials and
refunded licenses only (see this doc's Non-Goals note).

As of 2026-06-14, v2 license parsing/issuance and the pure entitlement resolver
exist, but sold runtime startup still uses the older required-license startup
gate until recovery/data-only wiring lands.

It implements the posture from [asset-protection-and-licensing.md](./asset-protection-and-licensing.md): BellField gates acquisition and updates, not continued operation. Runtime verification is offline-only and exists to prove that the installed copy has a legitimate right-to-run license.

## Goals

- Signed license file, verified locally with no network call.
- Perpetual right to run is separate from the update-entitlement window.
- Missing or cryptographically invalid license files can block sold-shaped runtime startup.
- Expired update windows, internet outages, clock skew, and restores onto replacement machines must not block running.
- The relay credential is issued alongside the license, but is a separate token stored in server config. The signed license file never contains relay secrets.

## Non-Goals

These are constraints, not merely deferred work:

- no runtime phone-home check
- no online kill switch
- no subscription-style recurring runtime validation
- no hardware-bound activation
- no anti-tamper or obfuscation treated as a security boundary
- no runtime refusal based on update-window expiry

> **v2 note.** These remain absolute **for a paid copy in good standing**. The
> planned v2 model ([license-refund-trial-plan.md](./license-refund-trial-plan.md))
> adds operation-gating to the `trial` and `dataOnly` license kinds only, plus an
> _opportunistic, fail-open_ license-status check that merely delivers a signed
> downgrade to an already-terminated trial/refunded license. A missed check is
> always a no-op, so paid runtime never depends on a network call — "no runtime
> phone-home that gates paid" and "no kill switch for paid" still hold.

## File Format

The license file is JSON:

```json
{
  "license": {
    "schemaVersion": 1,
    "licenseId": "lic_20260611_example",
    "shopName": "Example Service Co.",
    "issuedAt": "2026-06-11T00:00:00.000Z",
    "updateWindowEnd": "2027-06-11"
  },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "bellfield-license-v1",
    "value": "base64url-signature"
  }
}
```

Rules:

- `license.schemaVersion` is the license-body schema version. Current tooling
  accepts legacy `1` and v2 `paid | trial | dataOnly`; v1/no-kind resolves as
  paid for entitlement purposes.
- `license.licenseId` is a stable BellField-issued id and must be non-empty.
- `license.shopName` is display-only in the installed product and support bundles.
- `license.issuedAt` is an ISO timestamp. It may be in the future; clock skew must not block runtime.
- `license.updateWindowEnd` is a `YYYY-MM-DD` date. It is enforced by the Phase 4 updater, not by runtime startup.
- `signature.algorithm` is `Ed25519`.
- `signature.keyId` identifies the embedded BellField public key used for verification.
- `signature.value` is base64url without padding.

The signature covers the canonical UTF-8 JSON representation of the `license` object only. Canonical JSON means object keys are sorted lexicographically at every level and no insignificant whitespace is present. The outer `signature` object is never included in the signed bytes.

## Verification Rules

Runtime verification:

1. Read the file path from `BELLFIELD_LICENSE_PATH`.
2. Parse the JSON and validate the v1 shape.
3. Canonicalize the `license` object.
4. Verify the Ed25519 signature using the public key embedded in the product build.
5. Return the license identity and update-window end for diagnostics.

Failure rules:

- Current sold-shaped builds still refuse to start if a required license is
  missing, unreadable, malformed, or has a bad signature. The v2 recovery-mode
  startup change is planned in
  [license-refund-trial-plan.md](./license-refund-trial-plan.md).
- If the file is valid, the API starts regardless of `issuedAt`, `updateWindowEnd`, machine identity, or internet connectivity.
- If a source/dev/test build does not require a license, it may run without a license file. If a license file is configured, diagnostics may still report its status.

## Build and Config Boundary

Customer installs use the unified `bellfield-server.env` file:

```text
BELLFIELD_LICENSE_REQUIRED=true
BELLFIELD_LICENSE_PATH=C:\BellField\data\license\bellfield-license.json
```

Development and tests default to `BELLFIELD_LICENSE_REQUIRED=false`.

Release artifacts also include `bellfield-build-manifest.json` with `licenseRequired: true`. The API treats that build-manifest requirement as stronger than `BELLFIELD_LICENSE_REQUIRED=false`, so a sold release still requires a valid license file if an operator edits the env file. Source/dev runs have no build manifest by default and can remain unlicensed.

This is an install/operator guard, not anti-tamper protection. A person deliberately modifying shipped code can still bypass local checks; BellField's protection posture remains acquisition, updates, and relay access, not a runtime kill switch.

The public key is not a secret. The production public key is embedded in the product build. The private signing key is BellField-side only and must never be committed or shipped.

## Production Key Ceremony

Before first sale, BellField must perform and record a key ceremony:

1. Generate the Ed25519 keypair on Rob's Windows PC or another offline-controlled BellField machine.
2. Store the private key outside the repo under:

   ```text
   C:\Users\rober\Documents\API Keys\BellField\license-v1\bellfield-license-private-key.pem
   ```

3. Store the matching public key beside it for operator verification.
4. Embed only the public key in `apps/api/src/modules/licensing/license-verification.ts`.
5. Run `pnpm smoke:license-key` to prove a license issued with the private key verifies against the embedded public key.
6. Back up the private key to BellField-controlled offline storage before issuing customer licenses.

Private-key loss means BellField cannot issue additional licenses for that key version. Private-key exposure means a new `licenseKeyId` and embedded public key are required for future releases; existing offline installs keep running with their already-issued license files.

## Backup and Restore Boundary

The license file lives under the app-owned data directory so Phase 2 backups can include it. A restore onto a replacement machine must restore the license file along with the database and media root, or the operator must install a re-issued license before starting a sold-shaped API.

The license is customer-bound, not hardware-bound. A normal restore must not require online activation.

## Issuance Boundary

The Phase 3 issuance tooling is private BellField-side tooling:

- generate Ed25519 keypairs
- issue signed license files (`--kind=paid` default, `--kind=trial`,
  `--kind=dataOnly`, and `--kind=legacy` for v1 compatibility)
- append a non-secret issued-license ledger entry, including `schemaVersion`,
  `licenseKind`, and the kind-specific fields such as `operationEnd`,
  `terminatedLicenseId`, and `terminationReason`

The default update window for a new license is **one year from issuance**
(decided 2026-06-11): the software runs forever, updates are included for 12
months, and the window is renewable. `--update-window-end` stays explicit at
issuance time so support cases and renewals can set any date.

The issued-license ledger is bookkeeping, not runtime enforcement. Per-shop single-active behavior is enforced by the Phase 5 relay, not by the offline license file.

## Relay Credential Boundary

The relay token is issued alongside the license but remains separate:

- stored in unified server config
- revocable relay-side
- grants relay access and relay entitlement only
- never appears in the signed license file

This keeps offline right-to-run proof separate from online relay access.

## Update Artifact Signing Boundary

Release artifacts use a separate Ed25519 keypair from license files.

- License key: proves the installed copy has a perpetual right to run and carries the update window.
- Release key: proves a downloaded update artifact is a BellField-built release folder.

The release private key stays outside the repo under:

```text
C:\Users\rober\Documents\API Keys\BellField\release-v1\bellfield-release-private-key.pem
```

Only the release public key is embedded, currently in `tools/update/release-artifact.mjs`.
Private release-key loss means BellField cannot sign updates with that key version. Private release-key exposure requires a new release key id and public key in future releases.
