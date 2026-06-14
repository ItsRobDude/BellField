# BellField — Trial, Refund & Ownership Plan (v2 entitlement model)

**Status: planned, not built.** This is the controlling spec for the v2 license
entitlement model (`trial | paid | dataOnly`), the narrow-refund posture, and
the data-only degrade. It extends — and in two places deliberately refines —
the current v1 primitive in [license-design.md](./license-design.md) and the
ownership promise in [positioning-and-pricing.md](./positioning-and-pricing.md).
No code exists for this yet; today's runtime behavior is still the v1 primitive.

Decided through owner sparring, 2026-06-13.

---

## 0. Current state (verified against code, 2026-06-13)

- License verifier is **v1 only** — `schemaVersion: 1`, no `licenseKind`,
  `trial`, `dataOnly`, or `operationEnd`
  (`apps/api/src/modules/licensing/license-verification.ts`).
- The sold API **hard-fails before Nest starts** on a missing/invalid required
  license: `getApiRuntimeConfig()` throws if `BELLFIELD_LICENSE_REQUIRED=true`
  and `BELLFIELD_LICENSE_PATH` is unset
  (`apps/api/src/common/config/runtime-config.ts:133`), and
  `assertRuntimeLicense()` throws on an invalid file
  (`apps/api/src/main.ts:13-14`). **Both gates must soften for recovery mode
  (§7).**
- Issuance tooling mints **only v1 paid-style** licenses; it already appends a
  non-secret issued-license ledger (`tools/license/issue-license.mjs`).
- The relay can revoke active tokens
  (`apps/relay/src/modules/identity/relay-identity.repository.ts:319`) and gate
  update downloads, but has **no license-status/downgrade endpoint**. Relay auth
  (`authenticate()` and `verifyToken()`) looks up **active tokens only**
  (`apps/relay/src/modules/identity/relay-auth.service.ts:67,148`), so a revoked
  token cannot call any future endpoint authenticated the normal way (§9).
- The supported restore helper **stages and swaps the license file** from the
  backup set (`tools/install/restore-backup.mjs:171-208`). **This must not be
  allowed to erase a termination artifact (§8).**

Existing v1 paid licenses must keep working untouched.

---

## 1. Core decision

License kinds: `trial | paid | dataOnly`. `trial` and `dataOnly` degrade to
**data-only** (read-only + full export). `paid` **never** auto-locks. The
**trial is the buyer's-remorse exit**, which is what lets refunds stay narrow.

---

## 2. Public promise (ownership-scoped)

> **Buy it once. The version you own runs in your shop.**

Supporting copy:

> Your paid copy keeps operating without a subscription — offline, indefinitely.
> Trials and refunded licenses are limited to read-only/export-only access.
> Updates, support, and relay services are separate.

Keep "kill switch" out of buyer-facing copy — it advertises a mechanism a
prospect shouldn't have to think about. (Promotion of this wording to the
official one-liner in `positioning-and-pricing.md` is an owner decision; that
doc currently still carries the unscoped v1 line.)

---

## 3. Refund policy

1. Trial is the buyer-remorse path.
2. Paid purchases are **final after trial**, except: install failure on
   supported hardware, duplicate billing, legal requirement, serious unresolved
   BellField defect, rare owner-approved goodwill.
3. A refund **terminates the operational right** to use BellField.
4. Refunded installs move to **data-only**.
5. Non-refundable processor fees may be withheld **where legally permitted,
   disclosed before payment** — a backstop clause, not the routine.
6. Prefer **ACH/wire/check** for purchases (Stripe keeps the original
   ~2.9% + $0.30 even on full refund; ACH ~0.8% capped $5).

> Terms language here is policy, not legal advice. Have the actual Terms
> reviewed for the sale jurisdictions before launch (consumer-withdrawal rules,
> e.g. EU/UK, are stricter than US B2B).

### Refund cases

| Case                               | Decision                             | Access afterward                                               | Fees                                                               |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Install failure on supported setup | Full refund                          | No operational license; data-only if any data exists           | BellField eats                                                     |
| Duplicate billing                  | Refund the **duplicate charge only** | Paid license **stays active** (not a license refund)           | BellField eats duplicate                                           |
| Legal requirement                  | Follow law exactly                   | Data-only if the sale is unwound                               | No withholding unless clearly allowed                              |
| Serious unresolved defect          | Refund if unfixable                  | Data-only termination issued before/with refund where possible | Usually BellField eats                                             |
| Buyer remorse after trial          | Generally denied                     | Trial already expired → data-only                              | N/A                                                                |
| Goodwill                           | Owner discretion                     | Data-only                                                      | Default: eat the fee (withholding on a goodwill refund is miserly) |

---

## 4. License model v2

```ts
type LicenseKind = 'trial' | 'paid' | 'dataOnly';
```

**Trial** — carries `operationEnd`:

```json
{
  "schemaVersion": 2,
  "licenseKind": "trial",
  "licenseId": "lic_trial_...",
  "shopName": "Example Shop",
  "issuedAt": "...",
  "updateWindowEnd": "...",
  "operationEnd": "2026-07-13"
}
```

**Paid** — no `operationEnd`, ever:

```json
{
  "schemaVersion": 2,
  "licenseKind": "paid",
  "licenseId": "lic_paid_...",
  "shopName": "Example Shop",
  "issuedAt": "...",
  "updateWindowEnd": "2027-06-13"
}
```

**Data-only / refunded** — supersedes the license it terminates:

```json
{
  "schemaVersion": 2,
  "licenseKind": "dataOnly",
  "licenseId": "lic_refunded_...",
  "terminatedLicenseId": "lic_paid_...",
  "shopName": "Example Shop",
  "issuedAt": "...",
  "terminationReason": "refund"
}
```

Rules:

- v1 / no `licenseKind` ⇒ **paid**.
- `paid` must never carry `operationEnd`; **issuance rejects it and runtime
  ignores it** if somehow present.
- `trial` must carry `operationEnd`.
- `dataOnly` never permits operations.
- `terminatedLicenseId` names the paid/trial license this artifact terminates;
  precedence (§6) keys off it. (Renamed from an earlier `replacesLicenseId`,
  which was ambiguous against the artifact's own `licenseId`.)

---

## 5. Refund / termination ledger

The issued-license ledger gains termination records. A terminated `licenseId` is
terminated **permanently** — it never reactivates. A shop that re-purchases gets
a **new** `licenseId`, never a revival of the old one. This ledger is what the
license-status check (§9) consults to re-revoke a restored pre-refund license.

---

## 6. Entitlement — the signed-artifact store (the heart of the design)

**The cache stores signed artifacts, never mutable state.** No `{"state":"paid"}`
flag exists anywhere — that file would be forgeable on customer-owned hardware
and would turn the trial gate into a one-line bypass. The store holds only:

- the last **validly-signed license envelope** seen (trial/paid/dataOnly), and
- any **signed termination/downgrade receipt**.

Entitlement is **recomputed from re-verified signed artifacts on every
evaluation**, by precedence:

1. A signed **termination/`dataOnly`** receipt **supersedes** any paid/trial
   license whose `licenseId` equals its `terminatedLicenseId`.
2. Signed **paid** (or **v1/no-kind**) ⇒ **operational**, unless superseded by (1).
3. Signed **trial** ⇒ operational if `now < operationEnd`, else
   **trial-expired data-only**.
4. **Plaintext/unsigned** cache files are ignored for entitlement.
5. No verified artifact anywhere ⇒ **recovery** (§7).

Resulting states: `paidOperational`, `trialOperational`, `trialExpiredDataOnly`,
`refundedDataOnly`, `licenseRecovery`.

### Fail-safe table (this is what protects paying shops)

| Current license     | Cache (signed)                      | Result                                          |
| ------------------- | ----------------------------------- | ----------------------------------------------- |
| valid paid/v1       | —                                   | operational                                     |
| valid active trial  | —                                   | operational                                     |
| valid expired trial | —                                   | data-only                                       |
| valid `dataOnly`    | —                                   | data-only                                       |
| missing/corrupt     | last-valid **paid/v1**              | **operational** + System warning                |
| missing/corrupt     | last-valid **trial**                | trial rules from cache (never upgraded to paid) |
| missing/corrupt     | last-valid **dataOnly**/termination | data-only                                       |
| missing/corrupt     | **none**                            | recovery                                        |

Deleting files never helps a trial abuser: the signed trial envelope stays in
the cache, still bound by its `operationEnd`, and there is no signed _paid_
artifact to fall back to because they never had one.

---

## 7. Recovery-mode startup (boot-sequence change)

The sold API currently **process-exits** on a missing/invalid license. That is
incompatible with data-only, trial-expired, and recovery — all of which need the
app **running** to serve read-only screens, export, and license upload. So:

- The app **always boots** to at least **recovery/data-only**; it never crashes
  on a non-operational _license_.
- **Scope:** only the **license-related** startup gates soften — the
  `licenseRequired && !licensePath` config problem
  (`runtime-config.ts:133`) and `assertRuntimeLicense()` (`main.ts:14`).
  **Every other config problem still fails startup**: `DATABASE_URL`,
  `BELLFIELD_OFFICE_ORIGINS`, release-artifact-in-production, seed-data-in-prod,
  partial relay triplet. Recovery mode must not make production config
  validation toothless.
- The entitlement service decides the mode at startup **and re-evaluates live**
  (the §9 check can downgrade at runtime; a license upload can lift to
  operational without a hard restart where feasible).
- `licenseRecovery` serves a deliberately tiny, always-reachable surface:
  license upload/replacement, read/export of any existing data, System
  diagnostics, support bundle. Nothing operational.
- The initial-setup "no license yet" state reads as neutral _"add your
  license"_ — never _"refunded/terminated"_ framing.

---

## 8. Data-only mode

**Allowed:** login · read-only screens · System diagnostics · support bundle ·
license replacement/upload · full backup/export · restore/recovery · local data
download.

**Blocked:** customer/job/location/equipment mutations · estimate/invoice/payment
mutations · field-sync writes · inventory/purchasing/job-costing writes · relay
email/SMS/acceptance sends · payment links · customer-facing worker jobs ·
update downloads except license-recovery tools.

**Two hard requirements:** scheduled **backups keep running**, and **export is
the real full backup set** (DB dump + media + manifest + license/config) — not a
cosmetic CSV. This is what makes "your data is always yours" literally true and
is the entire ethical basis for degrading instead of bricking.

**Restore must never erase a termination artifact.** The supported restore
helper today swaps in the backup's license file
(`restore-backup.mjs:171-208`). In v2:

- normal restore may restore database/media;
- entitlement artifacts merge **most-restrictive-wins**;
- a signed termination/`dataOnly` artifact is **never removed** by restore;
- a paid license can only replace a `dataOnly` state through **explicit license
  install/replacement**, not ordinary backup restore.

(A hostile full-disk restore of a pre-refund image remains the accepted
residual — see §9.)

**Guard philosophy:** this is a conversion/termination _nudge, not a security
wall_. Bias it toward _never_ blocking a recovery/export/license path; a leaked
trivial write costs nothing, a wrongly-blocked license upload strands a real
shop.

---

## 9. Opportunistic revocation (the asymmetric, fail-open check)

A periodic license-status check — **"opportunistic revocation," not mandatory
activation.** This is the one place v2 touches the v1 "no phone-home" non-goal,
and it does so without breaking it (see §11).

- Install checks status periodically (weekly with jitter; also a background
  check after the API is already up — never blocks startup).
- **Missed / failed / timeout / unreachable / unsigned / garbage response ⇒
  no-op.** A legitimate offline paid install is _never_ affected.
- **"active" ⇒ no-op.**
- **"terminated/refunded" ⇒** the response must include a BellField-**signed**
  `dataOnly`/revocation receipt **for the exact licenseId**; the install
  **verifies the signature locally** before applying it. Then entitlement
  becomes data-only.
- **Terminate-only and licenseId-only.** The check sends a license id and
  receives a signed revocation-or-nothing. No usage data rides along, ever
  (anything more becomes the surveillance BellField sells against). Recovery
  from a _wrong_ termination is via re-issuing a fresh paid license, keeping the
  protocol one-directional and auditable.
- Backed by the permanent termination ledger (§5): a pre-refund backup restored
  onto the box runs only **until the next successful check**, which re-revokes
  it.

**Auth (the correction that makes this possible):** refund revokes the relay
token, but relay auth rejects revoked tokens — so a license-status endpoint
authenticated the normal way would be unreachable exactly when it is needed. The
`/v1/license-status` endpoint must therefore **accept revoked (or active)
tokens, and return only signed license-status/downgrade artifacts — never relay
services** (no email, payments, downloads, or activation binding). A dedicated
read-only verifier path (like `verifyToken()` but not filtering out revoked
tokens) is the clean shape.

**Invariant that can never bend: fail-open forever — never "lock after N missed
checks."** That single change would convert this into the phone-home that breaks
"works offline, forever." Miss #1 and miss #1,000 behave identically.

**Residual, explicitly accepted:** hostile + permanently offline + restored old
backup keeps running locally. Eliminating it requires mandatory online
activation, which is rejected. **Phone/app couriering** of the revocation (via a
field tech's device) is **deferred** — surface/trust cost outweighs the marginal
catch, and it doesn't catch the deliberate evader; if ever built, the device may
only ferry a signed artifact relay→install and must never _decide_ entitlement.

---

## 10. Refund workflow (operator)

1. Classify the refund reason.
2. Confirm whether an install/data exists.
3. Create/export a full backup for the shop.
4. Revoke relay token, update-window entitlement, release-download access.
5. If an operational install exists, issue/install the signed `dataOnly`
   license **and** record the termination in the ledger (so the §9 check
   enforces it even if they do not cooperate).
6. Confirm System shows data-only.
7. Process the refund per category (fees per §3).
8. Record refund/termination in the operator ledger.
9. Send closeout email: data remains exportable; operational license
   terminated; **export and decommission** (a frozen, unpatched install holding
   their customers' PII is a transition-out state, not a place to park).

Hostile/chargeback path: contest if appropriate · revoke relay/update/support
immediately · mark terminated in ledger · they are contractually unlicensed
(no support/updates/relay/payment links) · the §9 check re-revokes on any future
contact.

---

## 11. Reconciliation with the v1 non-goals (read this before objecting)

`license-design.md` lists, as constraints: _no runtime phone-home check, no
online kill switch, no subscription-style recurring runtime validation, no
runtime refusal based on update-window expiry._ `positioning-and-pricing.md`
calls "the software never stops working" the sacred line. v2 **preserves all of
these for a paid copy in good standing** and scopes them precisely:

- **Paid runtime never depends on a network check.** The §9 check is fail-open:
  a missed check is always a no-op, so no install's continued operation ever
  depends on reaching BellField. It _delivers_ a signed downgrade to an
  already-terminated trial/refunded license; it is delivery, not a gate.
- **No online kill switch for paid.** Operation-gating is a property of the
  `trial` and `dataOnly` kinds only, delivered by signed artifact. A `paid`
  license has no lock path — no clock, update-window, or missing file locks it.
- **"Never stops working" is scoped to ownership** — the version you _own_
  (paid, kept). A trial you never bought and a license you refunded are not
  "yours," and read-only-with-full-export is the honest treatment.

If a future change would let a `paid` copy lock automatically, or let a local
file edit flip `trial`→`paid`, it is wrong by construction.

---

## 12. Implementation slices

1. **Docs & copy** — this doc; mark v1 posture "current" in `license-design.md`
   and `positioning-and-pricing.md`; Terms draft.
2. **License schema v2** — extend verification; `issue-license.mjs` gains
   `issue-trial` / `issue-paid` / `issue-data-only`; ledger fields `licenseKind`,
   `terminatedLicenseId`, `terminationReason`; issuance rejects
   paid-with-`operationEnd`.
3. **Signed-artifact entitlement service** — re-verifies cached signed
   license/revocation every evaluation; precedence + fail-safe table (§6); System
   shows exact state. _No plaintext state cache._
4. **Recovery-mode startup** — soften only the license-related gates in
   `runtime-config.ts` and `main.ts`; live entitlement re-evaluation; tiny
   always-reachable recovery surface. Other config stays fatal.
5. **Data-only guard** — central guard over business mutations; explicit
   allowlist for read/export/support/system/license-replacement; backups
   continue; restore merge is most-restrictive-wins; tests proving
   expired-trial/refunded block writes but never block recovery/export.
6. **Worker behavior** — scheduled backups continue; relay sends, acceptance
   polling/actions, payment-link work, customer-facing jobs stop in data-only;
   System/timeline note where useful.
7. **Opportunistic revocation** — relay `/v1/license-status` endpoint (accepts
   revoked tokens, returns signed artifacts only) + permanent termination ledger;
   install-side fail-open check; signed-receipt verification; re-revoke restored
   backups. (Phone/app courier deferred.)
8. **Refund operator tooling** — `issue-data-only-license`, `revoke-relay-token`,
   `set-update-window-revoked`, and a refund-checklist script that prints what
   remains.
9. **UI** — trial banner (days left); expired/refunded data-only banner;
   always-available license replacement; one-click full export; **paid license
   replacement lifts data-only immediately** where feasible.
10. **Validation** — v1 ⇒ paid operational · paid + expired update window ⇒
    operational · paid missing file + cached paid ⇒ operational+warning · trial
    missing file + cached trial ⇒ trial rules · expired trial ⇒ data-only ·
    refunded/`dataOnly` ⇒ data-only · backup/export works in data-only ·
    data-only→paid replacement unlocks · plaintext cache ignored · signed
    revocation downgrades, unsigned/missed ⇒ no-op · restore never erases a
    termination artifact · non-license config problems still fail startup.

---

## 13. Hard guardrails (non-negotiables)

- **Operation-gating lives only in `trial`/`dataOnly`.** Paid/v1 has **no
  automatic lock path**.
- **Cache = re-verified signed artifacts, never a state flag.**
- **Absent ≠ revoked.** Missing fails _open_ to operational (with cached paid);
  only a _signed_ revocation fails _closed_.
- **The §9 check is fail-open forever** — never lock after N misses.
- **Data is always exportable** in every non-operational state.
- **Recovery startup softens license gates only** — other config stays fatal.
