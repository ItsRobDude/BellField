# BellField Asset Protection and Licensing

This document defines BellField's commercial protection posture: how BellField ensures only legitimate customers receive and run the product, and how update entitlement works under a one-time purchase model.

It exists because asset protection sits outside the feature milestones and was never explicitly decided. Without a written position, the product would drift toward either no protection at all or, worse, protection that quietly breaks BellField's self-hosted and offline-first promises.

This is a planning and decision document.
It does not mean any licensing, activation, or update-gating mechanism already exists in the codebase. As of this writing, none does.

This document is a sibling to [deployment-model.md](./deployment-model.md) and [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md), and it must stay consistent with both.

---

## 1. Business Model

BellField is sold as a **one-time perpetual purchase**, not a subscription.

This is deliberate and is a core part of the product's identity:

- the customer buys BellField once and owns the right to run it indefinitely
- a standard purchase includes software updates for a fixed coverage window of **X years** (the exact number is an open decision; see Section 10)
- after the update window ends, the purchased copy keeps running forever
- newer updates released after the window may require a paid update extension

A subscription-style product that stops working when payment lapses is explicitly **not** the model. The one-time purchase is a selling point, and the protection design must never quietly undermine it.

---

## 2. Core Principle: Gate Acquisition and Updates, Not Continued Operation

A one-time, self-hosted, offline-first product cannot rely on runtime DRM, and should not try to.

The reasoning:

- the product runs entirely on customer-owned hardware ([deployment-model.md](./deployment-model.md) Section 1)
- the product must keep working during internet outages ([deployment-model.md](./deployment-model.md) Section 11)
- BellField must not require BellField-hosted infrastructure in order to function ([deployment-model.md](./deployment-model.md) Section 12)

A hard "phone home or stop working" check would violate all three. So BellField does not try to gate whether a copy is _allowed to keep running_ based on a live server.

Instead, BellField protects the two things it genuinely controls:

1. **Acquisition** — who is allowed to _receive_ the product in the first place (Section 6).
2. **Updates** — who is allowed to _fetch newer builds_ (Section 7).

Both are naturally online, BellField-controlled transactions even though the product itself is offline-first. Obtaining software from BellField is inherently a point of control; running it day to day is not. This reframing dissolves the apparent conflict between protection and the offline-first promise.

---

## 3. What the License File Encodes

Protection centers on a **signed license file** delivered with each purchased copy.

The license file must be **offline-verifiable**: the product verifies it using an embedded public key, with no network call. BellField holds the corresponding private key and never ships it.

The license file separates two distinct concepts, and keeping them separate is essential to honoring the perpetual-purchase promise:

- **Perpetual right to run** — proves this is a legitimately licensed copy. This does not expire. It is what the runtime posture (Section 5) checks.
- **Update-entitlement window** — the date through which the customer is entitled to newer builds. This is checked only by the updater (Section 7). When it lapses, the customer keeps running; they simply cannot pull builds released after that date until they extend coverage.

The license file is also expected to carry customer/license identity and may carry edition or seat information. The concrete schema and signature scheme are intentionally left to a later format-pinning step (Section 10); this document fixes the posture, not the bytes.

---

## 4. Runtime Posture: Refuse to Start Without a Valid License

BellField's runtime posture is **refuse to start when no valid license file is present**.

This is the strongest local deterrent, and it is acceptable here only because of the precise scope and guardrails below. A self-hosted product run by small shops without dedicated IT cannot afford a "won't boot and nobody knows why" state, so the constraints in this section are part of the decision, not optional polish.

### What "refuse to start" means

Refuse to start applies **only** to an unlicensed copy: no license file, a corrupted or tampered file, or a signature that does not verify against the embedded public key.

### What must never trigger refuse to start

- **An expired update window must not block running.** A paid customer past their update coverage owns a perpetual right to run their installed version. Bricking them would break the one-time purchase promise (Section 1). Update-window expiry gates updates only.
- **An internet outage must not block running.** Verification is offline only. The product must never make a network call to decide whether it may boot ([deployment-model.md](./deployment-model.md) Sections 11 and 12).
- **A restore onto a replacement machine must not block running.** Restore-to-a-new-machine is a required capability ([deployment-model.md](./deployment-model.md) Section 10; [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) readiness gate 7). License binding must survive a normal backup/restore. BellField should bind the license to the customer/license identity, not to immutable hardware. Any reactivation step, if one exists, must be offline and must not strand a legitimate restore.

### Required safeguards

- verification is cryptographic and offline, using the embedded public key
- the license file lives in an app-owned data location that backup and restore already cover
- a missing or invalid license produces a clear, readable message and an obvious recovery path (re-obtain or re-install the license file, with support able to re-issue), not a silent crash
- first-install handling should present an understandable "license required" state rather than appearing broken

---

## 5. Acquisition Gate

"Only legitimate customers receive the product" is enforced at acquisition time, not at runtime.

- BellField does not publish the installer for open download.
- Each customer receives a per-customer, signed license file with their copy.
- Distribution rides on the assisted-install and pilot model already defined in [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md), and later a credentialed download path.
- BellField ships built, packaged artifacts through the signed installer ([self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) Section 6), not source. The repository itself is not the distribution channel.

Per-customer keying means a copy handed to another shop is traceable, unsupported, and a license-terms violation.

---

## 6. Update Gate: The Durable Moat

The update channel is BellField's most reliable protection, because getting a new build from BellField is unavoidably an online, BellField-controlled transaction even for an offline-first product.

- updates are served from a channel that requires a valid entitlement
- the updater checks one thing: is the build's release date within the license's update-entitlement window?
  - within the window: the update is allowed
  - past the window: the update is declined with a clear message that newer updates need renewed coverage
- extending coverage means BellField re-issues a license file with a later update-entitlement date. There is no subscription and no recurring runtime check.

A copy that was cracked or copied without entitlement is **frozen**: it may run, but it cannot legitimately pull BellField's future updates, security fixes, or improvements.

---

## 7. Threat Model and Honest Limits

BellField should be honest that self-hosted JavaScript/TypeScript cannot be made uncrackable. The goal is to raise cost and create leverage, not to achieve technical impossibility.

| Threat                                  | Posture                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casual copy to another shop             | Per-customer keying, no support, no updates, license-terms violation. Low real risk for the target market.                                                       |
| Public redistribution / piracy sites    | Low value for this market; redistributed copies are frozen with no update path.                                                                                  |
| Cracking out the local license check    | Possible. Low value for small legitimate shops. Mitigated by the update-channel moat, the signed installer, and license terms. Accepted as residual risk.        |
| Stealing source / IP                    | Ship built artifacts, not source; do not distribute the repository.                                                                                              |
| Update-window clock tampering           | Running is never clock-gated, so this cannot unlock running. At worst it nudges the updater's window check; low value and low impact. Accepted as residual risk. |
| Field Android app on technician devices | The APK talks only to the customer's own server; the valuable logic is the backend. The app is not the product. Standard store/signing hygiene is sufficient.    |

The biggest real protection is non-technical: the target customer is a small, legitimate field-service shop that wants support, updates, and reliability, not a cracked build. Commercial and relationship friction protects BellField more than code obfuscation ever will.

---

## 8. Infrastructure: What This Needs and Does Not Need

### Needs

- a private signing key held only by BellField, used to sign license files
- the matching public key embedded in the product for offline verification
- a small license-issuance step at purchase (a signing tool; no hosted server required)
- a credentialed download/update channel (the update gate)
- a build process that ships packaged artifacts and stamps each build with a release date the updater can read

### Does not need

- BellField-hosted customer runtime or data
- any runtime phone-home or online kill-switch
- hardware-locking or machine fingerprinting that would break restore-to-a-new-machine
- code obfuscation treated as a security boundary

---

## 9. Explicitly Out of Scope

These are deliberately rejected, not merely deferred:

- a hard online license server or remote kill-switch (violates offline-first)
- runtime operation gated on the update window (violates the perpetual purchase)
- subscription-style recurring runtime validation
- anti-tamper or obfuscation positioned as real security rather than a mild deterrent
- hardware-bound activation that a normal restore would invalidate

---

## 10. Open Decisions

These are intentionally unresolved and should be settled before or during implementation:

- **X**: the number of years of updates included with a standard purchase
- the concrete license-file schema and signature scheme (for example, an Ed25519-signed token), to be pinned in a later format step
- license binding details: customer-level versus install-level identity, constrained by the restore requirement in Section 4
- whether editions or seat counts are part of the first license model or deferred
- the exact first-install and recovery user experience for the refuse-to-start state
- the shape of the credentialed download/update channel

---

## 11. Milestone Fit

This work belongs primarily to **Milestone 11, Self-Hosted Pilot Deployment**, alongside the installer and updater, because licensing, distribution, and updates are the same problem space.

Narrow foundation prep may happen earlier only where it prevents architectural mistakes, specifically:

- placing the license file in an app-owned data location that backup and restore already cover
- ensuring builds are stamped with a readable release date for the updater
- keeping update-channel assumptions out of the runtime's offline path

BellField should not pause active operational milestones to build a licensing system early. This document fixes the position; the mechanism is built when the pilot install path is built.

---

## 12. Summary

BellField's asset protection posture:

- one-time perpetual purchase, updates included for a fixed window, newer updates may cost extra
- gate acquisition and updates, never continued operation
- a signed, offline-verifiable license file that separates the perpetual right to run from the update-entitlement window
- refuse to start only when no valid license is present, never on update-window expiry, internet outage, or a legitimate restore
- the update channel is the durable moat; a copied or cracked build runs but is frozen out of future updates
- no phone-home, no kill-switch, no hardware-lock, consistent with self-hosted and offline-first promises
- the real protection is a legitimate target market plus license terms, not uncrackable code

This posture protects the business without betraying the product's identity as a practical, self-hosted, offline-first field-service platform.
