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
filter. Rerun #11 used rebuilt `.21`/`.22` artifacts from merge commit
`8154dc8` with the address-filter fix. It passed USB hash verification,
extraction, LAN helper Public-profile refusal/consent, LAN env URL updates,
managed firewall rule creation/effectiveness validation, PostgreSQL
provisioning, packaged migrations, license copy, service rendering and
installation, PostgreSQL SCM `StartName` readback as
`NT SERVICE\bellfield-postgres`, ACL readback, API health, first-owner setup,
browser customer/location/job/appointment proof, reboot recovery, and
post-reboot browser login. Gate 1 still failed before real second-device proof
because the packaged LAN evidence collector hung in its firewall
enumeration/readback path before writing stdout or JSON. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-11.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-11.md).
Rerun #12 used rebuilt `.23`/`.24` artifacts from merge commit `0a6d4ed` with
the exact managed-rule LAN collector hardening. It passed USB hash
verification, extraction, LAN helper Public-profile refusal/consent, LAN env URL
updates, managed firewall rules, PostgreSQL provisioning/migrations, service
installation, PostgreSQL SCM `StartName`, ACL readback, API health,
first-owner setup, browser customer/location/job proof, reboot recovery, and
post-reboot service/API health. Gate 1 stopped at post-reboot browser login
because the newly created owner password existed only in transient
Codex/browser automation state and was unavailable after reboot. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-12.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-12.md).
Rerun #13 used the same `.23`/`.24` artifacts and the documented fixed dummy
Gate Day owner credential. Gate 1 passed end to end: post-reboot login,
packaged LAN evidence, and real second-device same-Wi-Fi browser login all
completed after the clean install, service, job-booking, and reboot checks. The
strict run then stopped at Gate 2 because the documented packaged manual backup
CLI could not find `pg_dump.exe` from the elevated shell used by the runbook.
See
[gate-day-clean-windows-smoke-2026-06-20-rerun-13.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-13.md).
Rerun #14 used rebuilt `.25`/`.26` artifacts from merge commit `a730639`. Gate 1
passed again, including post-reboot login, packaged LAN evidence, and real
second-device same-Wi-Fi browser login. Gate 2 advanced past the rerun #13
backup blocker: the packaged backup helper produced a fresh backup set with the
required shape. Restore then failed because the old restore helper tried to
recreate the database with the runtime app role and PostgreSQL returned
`permission denied to create database`. The repo-side helper now restores
through the owned schema path without granting permanent `CREATEDB`; rerun #15
proved that fix. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-14.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-14.md).
Rerun #15 used rebuilt `.27`/`.28` artifacts from merge commit `d60afaf`. Gate 1
passed again. Gate 2 passed from a real worker-produced backup set: restore used
the owned-schema path, services restarted, login worked, pre-backup data
survived, media/license checks were good, and the post-backup marker was erased.
Gate 3 failed during the real `.27` to `.28` update. The updater continued after
the outer wrapper timeout, eventually created a pre-update backup and staged
`.28`, but left `.27` installed with API/worker/office-web stopped and
PostgreSQL still running. At that point, the clean-machine blocker moved to
updater observability/recovery rather than backup/restore. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-15.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-15.md).
Rerun #17 used rebuilt `.31`/`.32` artifacts from source commit `233e061`.
Gate 1 and Gate 2 passed again, including restore-readiness recovery to health
`ok`. Gate 3 stayed open because overlapping elevated updater attempts after a
capture timeout invalidated the strict update proof, collided in staging, and
left `.32` installed with `.31` preserved as rollback, a fresh pre-update backup
present, all services stopped, and health down. Rerun #18 used authorized
rebuilt `.33`/`.34` artifacts from source commit `2582d79`. Gate 1 and Gate 2
passed again. Gate 3 started a single corrected updater process, but the updater
returned exit code `1`, installed `.34`, preserved rollback/pre-update-backup
evidence, left all four services stopped, and captured no structured
phase/result/failure line. Missing structured updater output is now treated as
an evidence gap unless durable logs or machine state prove a product failure.
The active clean-machine work is durable updater failure evidence plus the
post-swap service/recovery failure. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-18.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-18.md).
Rerun #19 used rebuilt `.35`/`.36` artifacts from source commit `d586b99`.
Gate 1 and Gate 2 passed again. Gate 3 now has durable updater evidence: the
`.35` to `.36` updater swapped in `.36`, preserved rollback/pre-update-backup
evidence, stopped all services, and failed while starting
`bellfield-postgres` with terminal
`BELLFIELD_UPDATE_FAILURE phase=startingPostgres`. The packaged read-only
update evidence collector also failed before JSON output on a
`LastWriteTimeUtc` type-conversion error, so the copied durable update JSONL is
the source of truth for this run. PR #81 landed after this run with staged
service wrapper/XML prep, staged service ACL hardening, and failed-update
collector hardening; the environmental proof remains open until fresh artifacts
rerun Gate 3 from the runner-first flow. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-19.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-19.md).
Rerun #21 used rebuilt `.39`/`.40` artifacts from source commit `b4135ba` after
the managed release-preparation runner landed. USB hashes and baseline
collection passed, and the runner's self-elevation lifecycle produced
`uac-requested`/`uac-approved` evidence. Gate 1 then stopped before BellField
install logic because the USB `START-HERE.txt` prepare command passed
`.\artifacts\...` as `-ArtifactZip`; after UAC the elevated child resolved that
relative path under `C:\WINDOWS\system32`, so artifact preflight failed and
`C:\BellField\release` was never published. This is a Gate Day runner/docs
path-resolution failure, not a product install or update failure. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-21.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-21.md).
Rerun #30 used `.55`/`.56` artifacts from PR #93 at source commit `2d0670f`.
Physical USB verification passed `189` checked and `0` failed. Gate 1 completed
the runner-first clean install, automatic first-owner creation, browser job
proof, reboot recovery, packaged LAN evidence, and real iPhone second-device
login. Gate 2 completed packaged backup and owned-schema restore; readiness
recovered after one service-start retry. Gate 3 completed the real installed
`.55` to `.56` update with a pre-update backup, preserved rollback release,
durable terminal success evidence, and healthy services after the required
reboot. Gates 4 and 5 were not attempted. See
[gate-day-clean-windows-smoke-2026-07-08-rerun-30.md](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md).
Current clean-machine status is still owned by
[gate-day-checklist.md](./gate-day-checklist.md):

- [x] clean-machine stranger install from the runbook through first-owner
      setup, job booking, reboot recovery, and second-device access. Rerun #8
      already captured service registration, service stability, ACL, API
      health, browser owner setup, browser job booking, reboot recovery, and
      post-reboot login evidence. Rerun #9 stopped earlier because the new LAN
      helper could not read generated env files with blank separator lines.
      Rerun #10 reached the Public-profile consent branch and created the
      expected firewall rules, then stopped because firewall effectiveness
      validation checked the wrong filter object. Rerun #11 proved the
      address-filter fix through service install, browser work, and reboot
      recovery, then stopped because the packaged LAN evidence collector hung
      before real second-device login. Rerun #12 proved the hardened artifact
      through service install, browser work, reboot recovery, and post-reboot
      service/API health, then stopped because the first-owner password was not
      available after reboot. Rerun #13 used the fixed documented Gate Day
      dummy credential and passed post-reboot browser login, packaged LAN
      evidence, and actual second-device browser login in one strict run. This
      gate is also the definition of
      done for the QuickBooks-Desktop-grade install bar
      ([positioning-and-pricing.md](./positioning-and-pricing.md) §The install
      bar) — the owner does not perform installs. Rerun #30 re-proved the gate
      with the runner-first path and automatic first-owner creation.
- [x] scratch-machine restore from a real backup set. Rerun #15 proved packaged
      backup creation, owned-schema restore, marker erasure, service restart,
      login, and pre-backup data readback on the clean Windows machine. Rerun
      #30 re-proved packaged backup and restore with all four services and API
      health recovered after one readiness retry. Its command log did not add a
      separate browser readback proving the post-backup marker absent, so the
      direct marker-erasure assertion remains grounded in rerun #15.
- [x] real installed v(N) → v(N+1) update with services and pre-update backup.
      Rerun #30 completed `.55` to `.56`, durably recorded terminal success,
      preserved the pre-update backup and rollback release, and returned all
      services plus API health after the required reboot.
- [ ] real expired-window update refusal remains open; Gate 4 was not attempted
      in rerun #30. The `gate4-expired-refusal` runner mode and the updater's
      pre-flight expired-window rejection (`BELLFIELD_UPDATE_REJECTED`) landed in
      PR #94 after rerun #30, so the drill is now automated and CI-guarded; it is
      unproven on the scratch machine until rerun #31.
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
      Since 2026-09-06 the office session token is remembered in browser
      storage (re-validated on load, bounded by the 12-hour absolute expiry
      and admin revocation); a server-side sign-out revocation endpoint is a
      session-hardening follow-up. Tunnel-level access policy remains optional
      hardening to evaluate, not a promised blocker.

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
