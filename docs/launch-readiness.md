# BellField Launch Readiness

This document is the punch list between "the engineering is disciplined" and "a real customer can find it, buy it, install it, run it, get support, and be operated safely."

It exists because that launch layer is spread across later milestones and cross-cutting concerns, and is easy to lose track of while feature milestones are active. BellField is already strong as a self-hosted operational platform; this document tracks the company/product-launch scaffolding it still lacks.

This is a planning and checklist document.
It does not change the active milestone focus, and most items here are not built yet. It is a consolidated view, not a license to start later milestones early. Each item is tagged with the milestone that owns it ([milestone-implementation-plan.md](./milestone-implementation-plan.md)), and a small set is explicitly marked safe to start now.

Siblings: [deployment-model.md](./deployment-model.md), [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md), [asset-protection-and-licensing.md](./asset-protection-and-licensing.md).

---

## 1. What "Launch Ready" Means Here

BellField is self-hosted, one-time purchase, offline-first. Launch readiness is therefore **not** the same as a SaaS launch, and the gaps must be closed in a way that fits that identity.

The benchmark question, borrowed from comparing BellField against a more SaaS-shaped product, is:

> Can a real customer **find** it, **buy** it, **install** it, **run** it, **get support**, and be **operated safely** — and would we **know** if it broke?

BellField has more operational breadth than a typical early SaaS, but far less launch scaffolding. The job of this document is to borrow launch **discipline** without borrowing SaaS **machinery** (see Section 12 for what is deliberately excluded).

---

## 2. Install and Deploy (the Artifact) — Milestone 11

The single biggest gap: today BellField cannot be handed to a customer. There is no installer, no Dockerfile, no runbook. Detailed posture lives in [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md).

- [ ] signed Windows server installer, fixed install root (`C:\BellField`) and data root (`C:\BellFieldData`)
- [ ] bundled or managed PostgreSQL install path (no customer DB administration)
- [ ] database creation and migration application during install
- [ ] API and worker registered as services
- [ ] office web app served from the server PC
- [ ] media root configuration and token-secret generation at install time
- [ ] local firewall rule guidance or automation
- [ ] first admin account setup flow
- [ ] ship built, packaged artifacts, not source; the repo is not the distribution channel
- [ ] health-check screen or command
- [ ] uninstall / repair path
- [ ] internal clean-install validation on a normal Windows PC from the runbook (the "Rob install test")

---

## 3. Update Path — Milestone 11

Updates are a stated product value ("safe updates over aggressive updates", [deployment-model.md](./deployment-model.md) Section 13) but the mechanism does not exist.

- [ ] update mechanism that does not require dev/repo commands
- [ ] builds stamped with a readable release date (needed by update-entitlement gating)
- [ ] "do not update unless safe" safety posture, configurable by the company
- [ ] update tested build-to-build against existing data without loss
- [ ] rollback / recovery story if an update goes wrong

---

## 4. Licensing and Commercial Entitlement — Milestone 11

Posture is decided ([asset-protection-and-licensing.md](./asset-protection-and-licensing.md)) but no mechanism exists yet.

- [ ] implement the signed, offline-verifiable license file (perpetual right-to-run vs update-entitlement window)
- [ ] private signing key management on BellField's side; embedded public key in the product
- [ ] license issuance tool/process at purchase
- [ ] refuse-to-start runtime check, correctly scoped, with a clear recovery path
- [ ] credentialed download/update channel (the update gate)
- [ ] decide open commercial inputs: X update-years, price, edition/seat model
- [ ] license binding that survives backup/restore to a replacement machine

---

## 5. Backup and Restore (Data Safety) — Milestone 11 (foundations notable in 10)

A self-hosted shop's data lives on its own server; losing it is unrecoverable. Required capability per [deployment-model.md](./deployment-model.md) Section 10.

- [ ] automatic and manual backup, company-configurable
- [ ] backup includes both the PostgreSQL database and the media root
- [ ] restore onto a replacement Windows PC, tested in practice
- [ ] warnings: backups not run recently, server drive low on space, field device not synced in a long time
- [ ] documented restore runbook a small shop can follow

---

## 6. Observability and Diagnostics (Would We Know If It Broke?) — Milestone 10

Once BellField runs on a customer server we currently have zero visibility. This must respect "zero BellField-side data by default" ([deployment-model.md](./deployment-model.md) Section 5), so the answer is local-first and opt-in, not phone-home telemetry.

- [ ] structured logging to replace ad-hoc console logs (thin abstraction; foundation for the items below)
- [ ] health / readiness endpoint or status surface
- [ ] support/log export bundle that avoids unnecessary business data (promised in deployment-model, not built)
- [ ] opt-in, privacy-conscious diagnostics the customer chooses to share
- [ ] optional customer-controlled error tracking as a later, additive add-on only

---

## 7. Operator and Support Controls — Milestone 10

The admin/support surface a small shop and BellField support actually need day to day. Some primitives exist in `identity-access` / [permissions-model.md](./permissions-model.md); coverage must be verified and completed.

- [ ] disable former employees while preserving their change history ([deployment-model.md](./deployment-model.md) Section 14)
- [ ] high-permission password reset; revoke/cut off a lost device
- [ ] owner/admin permission review tools
- [ ] backup and update approval controls (who is allowed)
- [ ] delete-confirmation hardening for destructive actions
- [ ] a documented support boundary ([self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) Section 9)
- [ ] a short operator/support runbook (resetting access, license re-issue, log export, restore)

---

## 8. Security and Release Harness — mostly safe to start now

BellField has strong permission modeling and conservative backend rules, but not a production security/release harness. BellField already has CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)), so several of these are cheap to wire in.

- [ ] secret scanning (e.g. secretlint/gitleaks) wired into existing CI — _safe now_
- [ ] production dependency audit (`pnpm audit --prod`, exposed as the `security:audit` script) as a CI signal — _safe now_
- [ ] `SECURITY.md` and a vulnerability-disclosure path — _safe now_
- [ ] startup validation of required production env vars (`BELLFIELD_MEDIA_ROOT`, `BELLFIELD_MEDIA_TOKEN_SECRET`, `DATABASE_URL`) so prod cannot boot on weak dev fallbacks — _safe now, prevents a real misconfig class_
- [ ] Dependabot or equivalent dependency-update flow — _safe now_
- [ ] a real security review before the first pilot (the repo's security-review path)

**Current dependency-audit state** (after the Next 15.5.19 / NestJS 11.1.24 / Expo SDK-56.0.8 upgrade pass): **both `pnpm audit --prod` (the `security:audit` script) and the full `pnpm audit` report "No known vulnerabilities found"** — down from 38 advisory-paths, so the CI `security:audit` step now exits zero (genuinely green, not just advisory-tolerated).

How each class was resolved, preferring the least-invasive correct fix:

- **Direct version bumps** carried most of it: Next 15.5.19, NestJS 11.1.24 (pulls patched `multer`, `path-to-regexp`, `file-type`), and the eslint bump to 9.39.4 (pulls patched `@eslint/plugin-kit`).
- **Range re-resolution** where a parent's semver range already allowed the patch: `fast-uri` (3.1.2 via `ajv`'s `^3.0.1`).
- **Surgical exact-version `pnpm.overrides`** only for transitives a parent pins below the fix and that have no newer parent: `postcss`, `qs`, `@xmldom/xmldom`, `brace-expansion`, `ws`, and `uuid@7.0.3 → 11.1.1`. The `uuid` case is a deliberate major override (xcode pins `uuid ^7`, the latest xcode still does, and the advisory is only patched in 11.x): it is safe here because the sole consumer is `xcode`, which uses only `require('uuid').v4()` — an export whose signature is unchanged from v7 to v11 — verified by loading `xcode` under the override and generating an id. Each override targets one exact version, so it auto-retires when the upstream parent moves.

---

## 9. Testing and Validation-Evidence Culture — mostly safe to start now

BidRivet's most transferable strength is not a tool, it is the habit of capturing dated proof for risky lanes. BellField has solid static/unit/build checks but most device, DB, installer, backup/restore, update, and production smoke proof is future or local-only.

- [ ] a validation playbook with dated evidence artifacts for risky lanes — _process started in [validation-playbook.md](./validation-playbook.md); keep collecting dated artifacts_
- [ ] a production-style smoke checklist: multi-office-desktop access, field-device sign-in and sync, media survives restart, backup, restore, update
- [ ] end-to-end coverage for critical office money-path flows
- [ ] real-hardware field-device proof (extend [field-mobile-smoke.md](./field-mobile-smoke.md))
- [ ] treat the install-strategy readiness gates as the definition of done for pilot

---

## 10. Mobile Distribution — Milestone 11 and later

The Android field app needs a real distribution path, with a self-hosted twist: the app points at the **customer's own** server, so the usual single-tenant store model does not map cleanly.

- [ ] decide the distribution model (Play Store with per-customer server configuration, managed/MDM, or controlled sideload)
- [ ] EAS or equivalent build profiles
- [ ] Android closed testing before wider release
- [ ] app-links / signing fingerprints and store metadata if Play Store is chosen
- [ ] build/store-link verification proof

---

## 11. Legal, Compliance, and Company Presence — business + Milestone 11

The non-code artifacts a company needs to sell and support a product. Mostly business work, much of it long-lead, none of it built.

- [ ] EULA / license agreement (called for by [asset-protection-and-licensing.md](./asset-protection-and-licensing.md), not written) — _safe now_
- [ ] a plain privacy posture statement (self-hosted: the customer owns their data) — _safe now_
- [ ] support terms and the support boundary as customer-facing language
- [ ] pilot agreement template ([self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) Section 4)
- [ ] code-signing certificate procurement (needed for the signed installer; long lead time) — _start now_
- [ ] company essentials: domain, support email, basic public site and pricing page
- [ ] customer-facing docs distinct from internal engineering docs
- [ ] recommended secure remote-access pattern documented ([deployment-model.md](./deployment-model.md) Section 12), without a BellField-hosted relay

---

## 12. Deliberately Out of Scope (No SaaS Cargo-Culting)

These belong to a hosted SaaS shape and are rejected because they conflict with BellField's identity. They are listed so nobody "adds them for parity" later.

- subscription billing (Stripe / Apple / Google IAP) — replaced by the one-time signed license
- BellField-hosted customer data or runtime
- mandatory managed cloud auth (e.g. Supabase) — auth stays self-hosted
- phone-home telemetry on by default
- a hard online license server or remote kill-switch
- a BellField-hosted relay as a requirement for field access

Future cloud options may be added later, but only as **additive** capabilities that never break the self-hosted, offline-first core.

---

## 13. Sequencing

Respecting the milestone discipline in [milestone-implementation-plan.md](./milestone-implementation-plan.md) Section 4 (do not start later milestones early under the label of "prep"):

**Safe to start now (hygiene / foundation / business, milestone-independent):**

- secret scanning, dependency audit, and `SECURITY.md` into the existing CI (Section 8)
- production env-var validation at startup (Section 8)
- the EULA and privacy posture statement (Section 11)
- code-signing certificate procurement (Section 11, long lead time)
- the validation-playbook habit and a smoke checklist (Section 9)
- a thin structured-logging abstraction only (Section 6), as foundation

**Milestone 10 (Reporting, History Hardening, Admin Polish):**

- observability/support-log export (Section 6)
- operator/support and admin controls, delete hardening (Section 7)
- warning/alert surfaces (overlaps backup/sync warnings in Section 5)

**Milestone 11 (Self-Hosted Pilot Deployment):**

- the installer and runbook (Section 2)
- the update path (Section 3)
- the license mechanism (Section 4)
- backup/restore proof (Section 5)
- remote access pattern and mobile distribution decisions (Sections 10, 11)
- the assisted pilot itself

**Milestone 12 (Stabilization):** broader hardening, performance, and cleanup beyond the pilot environment.

---

## 14. Definition of Launch-Ready

BellField is launch-ready for an assisted paid pilot when:

- a clean Windows machine can be installed from the runbook without dev-only assumptions
- the license mechanism issues, verifies offline, and recovers cleanly
- backup includes database and media, and restore onto a replacement machine is proven
- update from one build to the next is proven safe against existing data
- a second office desktop and a real Android field device both work and sync
- there is production error visibility and a privacy-conscious support/log export
- former-employee, lost-device, and password-reset controls work
- a security review has passed and required prod env vars are validated at startup
- an EULA, support boundary, and pricing/pilot terms exist as real artifacts
- supported and unsupported customer setups are documented to control support risk

Until those hold, assisted install remains the only supported commercial model.

---

## 15. Summary

BellField's next company-readiness leap is Milestone 10 and Milestone 11, not more field-service features. The work is to add launch scaffolding — install, update, license, backup/restore, observability, operator controls, security harness, validation evidence, and the legal/commercial surface — while keeping the self-hosted, offline-first, one-time-purchase identity intact and refusing the SaaS machinery that would betray it.
