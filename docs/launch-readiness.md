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
The fourth clean-machine attempt ran on 2026-06-20 after the XML/logpath/ACL
fix. USB preflight, extraction, server config, PostgreSQL provisioning,
migrations, license placement, service manifest rendering, and the checked
env/PostgreSQL ACL readbacks passed. Service startup still failed because the
installed Windows service account was `LocalSystem` even though the WinSW XML
contained the intended `NT SERVICE\bellfield-postgres` block; see
[gate-day-clean-windows-smoke-2026-06-20-rerun-4.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-4.md).
The fifth clean-machine attempt ran on 2026-06-20/21 with rebuilt artifacts
after the SCM service-account fix. It stopped at the required pre-service
diagnostic before server config or service installation; see
[gate-day-clean-windows-smoke-2026-06-20-rerun-5.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-5.md).
The sixth clean-machine attempt ran on 2026-06-21 with corrected diagnostic and
installer artifacts. It got through clean extraction, server config,
PostgreSQL provisioning, packaged migrations, license placement, service
manifest rendering, and elevated service installation. `bellfield-postgres`
read back as `NT SERVICE\bellfield-postgres`, stayed running, and the
PostgreSQL ACL readbacks matched the intended narrow model. Gate 1 still failed
at the required post-install service readback because API/worker refused the
partial relay env triplet created by a generated
`BELLFIELD_RELAY_SERVER_INSTANCE_ID` with empty relay base URL/token. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-6.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-6.md).
The seventh clean-machine attempt ran on 2026-06-21 with the relay-disabled
runtime config correction and installer stabilization gates. It proved the
generated instance ID plus blank relay base URL/token starts as relay disabled,
all four services stay running, `bellfield-postgres` reads back as
`NT SERVICE\bellfield-postgres`, the packaged service collector works after ACL
hardening, and API `/health` reaches `ok`. Gate 1 now fails later at browser
first-owner setup: `POST /identity/setup/first-owner` returns 500 while
recording a failed setup attempt because `blocked_until` is a timestamp column
and the SQL path supplies text. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-7.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-7.md).
The repo-side fix now casts that failed-attempt SQL, adds a PostgreSQL-backed
regression for the throttle query, and requires the release ZIP smoke to prove
invalid-token handling plus valid first-owner creation before USB prep. The
eighth clean-machine attempt used that rebuilt artifact pair. Its first
preflight exposed a USB hash manifest mistake around mutable current-run
evidence files; after the manifest was corrected, the run continued through
clean install, service health, browser first-owner setup, job booking, reboot
recovery, and post-reboot login. Gate 1 still failed at second-device LAN
access: two same-Wi-Fi devices timed out against the installed PC's LAN IP even
though local LAN-IP office/API checks passed and no explicit
BellField/Node/3000/3001 inbound firewall rule was found. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-8.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-8.md).
PR #68 added the packaged LAN access helper: it writes LAN-safe office/API URLs,
creates exact BellField-managed Private/Domain LocalSubnet firewall rules for
office/API ports only, and fails closed on Public profiles unless explicitly
consented. Rerun #9 proved the first packaged helper bug: the helper crashed on
generated env blank separator lines before reaching Public-profile handling.
Rerun #10 used rebuilt `.19`/`.20` artifacts from source commit `31cd16c` and
proved that blank-line fix reached the intended Public-profile refusal/consent
branch. After explicit operator consent it changed Wi-Fi to Private and created
the expected TCP `3000`/`3001` LocalSubnet rules, but failed its own
effective-rule validation before PostgreSQL provisioning because the helper
appears to read remote address from the port filter instead of the address
filter. The source now patches configurator/collector address-filter readback
and adds a behavioral helper-smoke guard; the path still needs a rebuilt
artifact and clean Windows proof with a real second-device login.
The remaining clean-machine proofs are still owned by
[gate-day-checklist.md](./gate-day-checklist.md):

- [ ] clean-machine stranger install from the runbook through first-owner
      setup, job booking, reboot recovery, and second-device access. Rerun #8
      already captured service registration, service stability, ACL, API
      health, browser owner setup, browser job booking, reboot recovery, and
      post-reboot login evidence. Rerun #9 stopped earlier because the new LAN
      helper could not read generated env files with blank separator lines.
      Rerun #10 reached the Public-profile consent branch and created the
      expected firewall rules, then stopped because firewall effectiveness
      validation checked the wrong filter object. The source has the
      address-filter fix and helper-smoke guard, but the remaining Gate 1 gap is
      proving the fixed packaged LAN/firewall path from another device. This
      gate is also the definition of
      done for the QuickBooks-Desktop-grade install bar
      ([positioning-and-pricing.md](./positioning-and-pricing.md) §The install
      bar) — the owner does not perform installs.
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
