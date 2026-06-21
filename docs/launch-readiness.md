# BellField Launch Readiness

This is the pre-pilot punch list: what still stands between today's repo and a
real paid assisted pilot. Rewritten 2026-06-12 after the sellability arc
(installer, backup/restore, licensing, updater, delivery relay) landed; the
old aspirational checklists for that work are gone because the work shipped.

The benchmark question is unchanged:

> Can a real customer **find** it, **buy** it, **install** it, **run** it,
> **get support**, and be **operated safely** — and would we **know** if it
> broke?

This document consolidates; it does not own any single area. Mechanics and
sequencing live in
[sellable-product-execution-plan.md](./sellable-product-execution-plan.md);
market identity and pricing live in
[positioning-and-pricing.md](./positioning-and-pricing.md).

---

## 1. Done — pointers only

Built, tested, and (where marked) deployed. Each line names its evidence.

- **Installer + runbook** (release assembly, services, first-owner setup,
  health check) — [install-runbook.md](./install-runbook.md),
  [phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md)
- **Backup/restore foundation** (scheduled backups, retention, restore
  helper, freshness status) — [restore-runbook.md](./restore-runbook.md),
  [phase-2-local-backup-restore-smoke-2026-06-11.md](./phase-2-local-backup-restore-smoke-2026-06-11.md)
- **Licensing primitive** (signed offline license, refuse-to-start scope,
  issuance tooling, backup coverage) — [license-design.md](./license-design.md),
  [phase-3-local-license-smoke-2026-06-11.md](./phase-3-local-license-smoke-2026-06-11.md)
- **Update channel** (signed artifacts, update-window gating, packaged
  updater, rollback preservation) —
  [phase-4-local-updater-smoke-2026-06-11.md](./phase-4-local-updater-smoke-2026-06-11.md)
- **Delivery relay, deployed to production** (per-shop tokens, quotas,
  suppression, webhooks, credentialed release downloads; first real
  end-to-end delivered email; SSH/firewall hardening and off-box relay backups
  completed on the testing host; DHCP reservations, controlled reboot proof,
  and external uptime monitoring in place) —
  [delivery-relay-plan.md](./delivery-relay-plan.md),
  [relay-deployment-2026-06-12.md](./relay-deployment-2026-06-12.md)
- **Estimate acceptance links** (relay-hosted public approve/decline pages,
  version-pinned links, structured decline reasons, worker poll/ack, office
  state surfacing; live relay smoke passed 2026-06-13) —
  [acceptance-links-design.md](./acceptance-links-design.md),
  [phase-6a-live-acceptance-smoke-2026-06-13.md](./phase-6a-live-acceptance-smoke-2026-06-13.md)
- **Security harness in CI** — secret scanning, blocking prod dependency
  audit (currently zero known vulnerabilities), `SECURITY.md` +
  `security@bellfield.app`, prod env-var startup validation, Dependabot
- **Release runtime-mode guard** — release build manifests now refuse API
  startup unless `NODE_ENV=production`; Windows service manifest rendering
  emits production mode for API/worker/office and rejects bootstrap seeding
- **Commercial inputs decided** — pricing, update-window default, relay rate
  — [positioning-and-pricing.md](./positioning-and-pricing.md)

---

## 2. Validation gates (gate day)

Local same-machine proof exists for everything above. The first clean-machine
attempt ran on 2026-06-20 and failed before migrations because the signed
artifacts packaged PostgreSQL `bin` but not the `lib`/`share` runtime files
required by the bundled tools; see
[gate-day-clean-windows-smoke-2026-06-20.md](./gate-day-clean-windows-smoke-2026-06-20.md).
The release packaging fix now includes the full PostgreSQL runtime, app-local
VC++ runtime DLLs, and a release-build smoke that functionally runs packaged
PostgreSQL. The second clean-machine attempt ran on 2026-06-20, got through
PostgreSQL provisioning, and then failed during migrations because the extracted
ZIP could not resolve API Node dependencies such as `pg`; see
[gate-day-clean-windows-smoke-2026-06-20-rerun-2.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-2.md).
The third clean-machine attempt ran on 2026-06-20 with the portable ZIP fix:
the artifact extracted, packaged PostgreSQL provisioning completed, packaged
migrations applied, and services registered, then `bellfield-postgres` failed
because WinSW registered PostgreSQL under `LocalSystem` and PostgreSQL refuses
to run with administrative permissions; see
[gate-day-clean-windows-smoke-2026-06-20-rerun-3.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-3.md).
The current release slice renders PostgreSQL under
`NT SERVICE\bellfield-postgres` with dedicated log paths and ACLs; that fix is
still pending clean-machine rerun proof.
The remaining clean-machine proofs are still owned by
[gate-day-checklist.md](./gate-day-checklist.md):

- [ ] clean-machine stranger install from the runbook (service/reboot/ACL
      proof, real `pg_dump`/`pg_restore` on the Windows host). This gate is
      also the definition of done for the QuickBooks-Desktop-grade install
      bar ([positioning-and-pricing.md](./positioning-and-pricing.md) §The
      install bar) — the owner does not perform installs.
- [ ] scratch-machine restore from a real backup set
- [ ] real installed v(N) → v(N+1) update with services and pre-update backup
- [ ] sold-shaped install sends and accepts through the production relay end
      to end (closes the formal Phase 5/6a environmental gate)
- [ ] second office desktop + real Android field device against that install

Gate day is validation debt, not build debt — it never blocks build lanes.

---

## 3. Security before pilot

- [x] the release artifact must refuse to run in development mode. Closed
      2026-06-13: release build manifests require API
      `NODE_ENV=production`, and Windows service manifests force production
      mode with seed bootstrap disabled.
- [ ] a real security review before the first pilot
- [ ] the managed-remote-access prerequisites in
      [remote-access-plan.md](./remote-access-plan.md) — login/setup
      throttling, office password posture, session hardening, and field-mobile
      base-URL handling. Managed access is a day-1 sale item, so required
      prerequisites are launch blockers, not later polish. Login throttling was
      closed on 2026-06-19 with 5 failed attempts inside 15 minutes creating a
      5-minute lockout; the new-password minimum and session expiry fit were
      closed the same day; first-owner setup throttling is now DB-backed under
      a fixed setup bucket. Field-mobile remote URL handling remains open.
      Tunnel-level access policy remains optional hardening to evaluate, not a
      promised blocker.

---

## 4. BellField-side ops leftovers

Small, owner-actionable; details in
[relay-deployment-2026-06-12.md](./relay-deployment-2026-06-12.md):

- [ ] optional hard power-loss/AC-loss proof for the laptop relay if we want
      hardware-level evidence beyond the completed controlled reboot proof
- [ ] permanent relay-host cutover decision when a paying customer's
      homeowner-facing links go live

---

## 5. Legal, company, and customer-facing surface

Mostly business work, much of it long-lead:

- [ ] EULA / license agreement
- [ ] plain privacy posture statement (self-hosted: the customer owns their
      data; sent documents transit the relay transiently)
- [ ] support terms and the supported-path boundary as customer-facing
      language ([positioning-and-pricing.md](./positioning-and-pricing.md) §
      support philosophy)
- [ ] pilot agreement template
      ([self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) §4)
- [ ] code-signing certificate procurement (long lead time — start early)
- [ ] public site: pre-release page first (copy drafted in
      [prerelease-site-draft.md](./prerelease-site-draft.md), founding
      pricing published, waitlist), grown into the launch site later
- [ ] start-to-finish install video (doubles as marketing proof of the
      install bar)
- [ ] customer-facing install/restore docs distinct from internal engineering
      docs
- [ ] Android field-app distribution decision (Play Store with per-customer
      server config, managed/MDM, or controlled sideload) + build profiles

---

## 6. Deliberately out of scope (no SaaS cargo-culting)

Rejected because they conflict with BellField's identity; listed so nobody
"adds them for parity" later:

- subscription billing — replaced by the one-time signed license
- BellField-hosted customer data or runtime (the relay and the optional
  managed-access tunnel transit traffic; they never store business data)
- mandatory managed cloud auth — auth stays self-hosted
- phone-home telemetry on by default
- a hard online license server or remote kill-switch — the software never
  stops working (the sacred line)
- any BellField-hosted service as a **requirement** for field access —
  managed remote access is an optional paid add-on with a free BYO route

---

## 7. Definition of pilot-ready

BellField is ready for an assisted paid pilot when:

- every gate-day box in §2 is checked
- the release artifact refuses dev mode and the security review has passed
- the managed-remote-access security prerequisites hold
- an EULA, support boundary, and pilot terms exist as real artifacts
- supported and unsupported customer setups are documented to control
  support risk

Until those hold, assisted install remains the only supported commercial
model.
