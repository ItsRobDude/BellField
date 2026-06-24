# BellField Self-Hosted Installation Strategy

This document defines how BellField should approach real customer installation.

It exists because "self-hosted first" must not turn into "the customer figures out deployment."
BellField can keep customer data on customer-owned hardware while still providing a controlled, supported, boring install path.

This is a planning and operating-position document.
It does not mean the production installer already exists.

---

## 1. Installation Product Rule

BellField's first self-hosted release should support one narrow deployment shape well before it supports many deployment variations poorly.

The early rule is:

- BellField owns the install recipe.
- The customer owns the machine and data.
- BellField does not expect customers to run developer commands.
- BellField does not support arbitrary homegrown server layouts at first.
- Assisted installation is acceptable, and likely preferable, for the first paid pilots.

Self-hosted should mean customer-controlled data, not customer-managed complexity.

---

## 2. Supported Early Install Profile

The first real pilot install path should target:

- one dedicated or semi-dedicated Windows server PC at the shop
- one PostgreSQL database managed by the BellField install path
- one BellField API service running on the server PC
- one BellField worker service running on the server PC
- one office web app served from the server PC
- one app-owned media storage directory on the server PC
- one app-owned backup directory or configured local/network backup destination
- office desktops using a browser to reach the server
- Android field devices configured to sync with the customer's BellField server

The first supported profile should not require:

- Git
- Node.js
- pnpm
- Docker Desktop
- Visual Studio tooling
- command-line database administration
- manual editing of source files
- customers copying files into random application folders

Those tools may remain part of development, but they are not a customer install story.

---

## 3. Explicitly Unsupported Early Setups

BellField should not promise support for these setups in the first pilot deployment lane:

- multiple BellField server PCs for the same company
- customer-managed Kubernetes, Docker Swarm, or other orchestration platforms
- Linux-only deployment as the primary path
- cloud-hosted customer data managed by BellField
- customers bringing their own existing PostgreSQL server without review
- random network-attached storage layouts without backup/restore validation
- internet-exposed servers without a documented secure remote-access pattern
- office desktops running separate local databases

These options may be possible later.
They should not be allowed to define the early support burden.

---

## 4. Setup Offering

For early pilots, BellField should assume an assisted setup model.

Recommended commercial posture:

- the customer buys or designates a supported Windows server PC
- BellField provides a pre-install checklist
- BellField performs or guides the first installation remotely or in person
- BellField verifies office browser access from at least one other office desktop
- BellField verifies at least one Android field device can sign in and sync
- BellField verifies backup creation and restore procedure before treating the install as pilot-ready

This model keeps the self-hosted promise while avoiding a false "just install it yourself" claim before the installer has earned that trust.

Later, after repeatable pilot installs, BellField can add a mostly self-service installer path.

---

## 5. Pre-Install Checklist

Before a customer pilot install, BellField should collect or confirm:

- Windows version and edition
- CPU, memory, available disk space, and drive health expectations
- whether the machine can stay powered on during service hours
- whether the machine is on a stable wired network
- local admin access for installation
- business data backup expectations
- desired media storage location
- desired backup location
- office desktop browser access on the local network
- field device access path from outside the shop
- who owns admin credentials
- who is allowed to approve updates and backups

The checklist should produce a clear answer:

- supported as-is
- supported after a specific hardware/network fix
- not supported for pilot without a custom setup quote

---

## 6. Installer and Runbook Target

The production install experience should eventually provide:

- a signed BellField Server installer or similarly boring install package
- fixed install root, such as `C:\BellField`
- app-owned data directories, such as `C:\BellFieldData`
- PostgreSQL install or bundled management path
- database creation and migration application
- API service registration
- worker service registration
- office web app hosting
- media root configuration
- token secret generation
- local firewall rule guidance or automation
- first admin account setup
- health check screen or command
- backup job creation
- restore procedure
- update procedure
- log export procedure
- uninstall or repair procedure

The customer should not need to know the repo's package manager or development commands.

Current Phase 1 implementation note: the repo now contains an assisted install runbook and release/service tooling in [install-runbook.md](./install-runbook.md). That is a repo-side install path, not yet a passed clean-machine self-serve installer gate.

A same-machine compiled-release smoke passed on 2026-06-11 and is recorded in
[phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md).
The first clean Windows gate-day attempt ran on 2026-06-20 and failed before
migrations because the release artifact omitted PostgreSQL runtime support
files (`lib`/`share`) required by the bundled PostgreSQL tools; see
[gate-day-clean-windows-smoke-2026-06-20.md](./gate-day-clean-windows-smoke-2026-06-20.md).
The release packaging gap is fixed repo-side, including app-local VC++ runtime
DLLs for the bundled Windows PostgreSQL tools, and the release-build smoke now
functionally runs packaged PostgreSQL. The second clean Windows attempt ran on
2026-06-20 and proved PostgreSQL provisioning, then failed during migrations
because the extracted ZIP could not resolve API Node dependencies such as `pg`;
see
[gate-day-clean-windows-smoke-2026-06-20-rerun-2.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-2.md).
The third clean Windows attempt ran on 2026-06-20 and proved the portable ZIP
dependency fix, packaged PostgreSQL provisioning, packaged migrations, and
service registration. It then failed when the PostgreSQL service ran as
`LocalSystem`; PostgreSQL refuses administrative service users on Windows. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-3.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-3.md).
The fourth clean Windows attempt ran on 2026-06-20 with the
`NT SERVICE\bellfield-postgres` XML/logpath/ACL slice. It proved the repaired
USB docs, artifact hashes, extraction, server config, packaged PostgreSQL
provisioning, packaged migrations, license placement, service manifest
rendering, and the checked env/PostgreSQL ACL readbacks. It still failed at
service startup because the installed SCM service account was `LocalSystem`
despite the rendered XML containing the intended service account block. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-4.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-4.md).
The repo-side installer now enforces and reads back the actual Windows service
account before service startup, but the clean-machine gate remains open until a
rebuilt artifact carries that fix and passes the runbook end to end on a cleaned
machine.
The fifth clean Windows attempt ran on 2026-06-20/21 with those rebuilt
artifacts. It verified active artifact hashes and extraction, then stopped at
the required pre-service diagnostic before server config or service
installation. The diagnostic showed Windows SCM accepted
`NT SERVICE\bellfield-postgres`, `StartName` read back correctly, the service
started as that virtual account, and SID-only ACL write succeeded. It still
failed because the diagnostic proof logic required the service SID to appear in
`whoami /groups` and then crashed in its empty-password compatibility branch.
See
[gate-day-clean-windows-smoke-2026-06-20-rerun-5.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-5.md).
The sixth clean Windows attempt ran on 2026-06-21 with corrected diagnostic and
installer artifacts. It completed clean extraction, server config, PostgreSQL
provisioning, packaged migrations, license placement, service rendering, and
elevated service installation. `bellfield-postgres` read back as
`NT SERVICE\bellfield-postgres`, stayed running, and the PostgreSQL ACL
readbacks matched the intended narrow model. Gate 1 still failed because
API/worker refused the generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID` with empty
relay base URL/token. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-6.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-6.md).
The seventh clean Windows attempt ran on 2026-06-21 with the relay-disabled
runtime config correction and installer stability gates. It proved that the
generated server instance ID with blank relay base URL/token starts API/worker
as relay disabled, that all four services stay running through the installer
settle window, that API `/health` reaches `ok`, and that the packaged elevated
service evidence collector works after ACL hardening. Gate 1 still failed at
browser first-owner setup: `POST /identity/setup/first-owner` returned 500
while recording a failed setup attempt because `blocked_until` is a timestamp
column and the SQL path supplied text. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-7.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-7.md).
The next artifact pair fixed first-owner setup failed-attempt persistence and
proved invalid-token handling plus valid owner creation in the packaged release
smoke. The eighth clean Windows attempt first exposed a USB manifest mistake
around mutable current-run `evidence/**` files; after the manifest was corrected
without changing the product ZIPs, the same rerun continued through clean
install, service health, browser first-owner setup, job booking, reboot
recovery, and post-reboot login. Gate 1 still failed at second-device LAN
access: two same-Wi-Fi devices timed out against the installed PC's LAN IP while
the installed PC could reach office web and API health through that LAN IP
locally, and no explicit BellField/Node/3000/3001 inbound firewall rule was
found. See
[gate-day-clean-windows-smoke-2026-06-20-rerun-8.md](./gate-day-clean-windows-smoke-2026-06-20-rerun-8.md).
PR #68 added that Windows LAN ingress path as a packaged helper that sets
LAN-safe office/API URLs, manages exact BellField-owned Private/Domain
LocalSubnet firewall rules for office/API ports only, and fails closed on Public
profiles unless explicitly consented. The ninth clean Windows attempt passed
hash verification, extraction, baseline collection, and server config, then
failed before PostgreSQL provisioning because the LAN helper's PowerShell env
reader rejected blank separator lines in the generated env. The tenth attempt
used rebuilt `.19`/`.20` artifacts from source commit `31cd16c` and proved that
fix reached the Public-profile refusal/consent branch. After explicit operator
consent it changed Wi-Fi to Private and created the expected TCP `3000`/`3001`
LocalSubnet rules, but stopped before PostgreSQL provisioning because the helper
appears to validate `RemoteAddress` from the port filter instead of the address
filter. The source now patches the configurator/collector readback and adds a
helper-smoke guard for the NetSecurity object model. The eleventh attempt used
rebuilt `.21`/`.22` artifacts from merge commit `8154dc8` and proved the
address-filter fix through LAN env URL updates, managed firewall rule
validation, PostgreSQL provisioning/migrations, service installation, API
health, first-owner setup, browser job/appointment proof, reboot recovery, and
post-reboot login. Gate 1 still failed before real second-device proof because
the packaged LAN evidence collector hung while reading firewall evidence and
wrote no JSON. The twelfth attempt used rebuilt `.23`/`.24` artifacts from
merge commit `0a6d4ed` and proved the collector-hardening artifact through USB
hash verification, extraction, LAN helper Public-profile refusal/consent, LAN
env URL updates, managed firewall rule creation, PostgreSQL
provisioning/migrations, service installation, PostgreSQL SCM `StartName`, ACL
readback, API health, first-owner setup, browser job proof, reboot recovery,
and post-reboot service/API health. Gate 1 stopped before post-reboot browser
login because the first-owner password existed only in transient Codex/browser
automation state and was unavailable after reboot. The run did not reach
packaged LAN evidence or real second-device proof. At that point, Gate 1 still
needed the fixed documented Gate Day dummy credential plus a cleaned rerun
proving post-reboot login, packaged LAN evidence, and real second-device
access. The thirteenth
attempt used that fixed dummy credential with the same `.23`/`.24` artifacts
and passed the full Gate 1 clean Windows install/LAN proof, including
post-reboot login, packaged LAN evidence, and a real same-Wi-Fi iPhone browser
login. The strict run then stopped at Gate 2 because the documented packaged
manual backup CLI could not find `pg_dump.exe` from the elevated shell used by
the runbook; backup/restore remains the next install-readiness blocker.

Current Phase 2 implementation note: backup and restore now have repo-side tooling and System visibility, documented in [restore-runbook.md](./restore-runbook.md). A configured network backup path should still be treated as unsupported until a restore drill has passed from that exact path.

---

## 7. Minimum Readiness Gates

BellField should not sell a self-serve installation story until these gates pass:

1. A clean Windows machine can be installed from the runbook without developer-only assumptions.
2. Rob can install BellField locally from the runbook without relying on hidden repo knowledge.
3. A second office desktop can open the office app from the server over the local network.
4. An Android field device can connect, cache assigned work, save offline work, and sync back.
5. Media upload storage works and survives app restarts.
6. Backup includes both PostgreSQL data and the media root.
7. Restore onto a replacement machine has been tested.
8. Update from one build to the next has been tested with existing data.
9. Failure states have readable messages and logs.
10. The runbook states what is unsupported instead of implying universal compatibility.

Until these pass, assisted install should be the supported early commercial model.

---

## 8. First Internal Install Test

The first meaningful deployment validation should be an internal "Rob install test."

Goal:

- prove the install path on a normal Windows PC before asking a real shop to trust it

Rules:

- start from a clean checklist
- do not use repo dev commands as customer instructions
- record every manual step
- record every confusing assumption
- record every firewall, permissions, service, database, media, backup, and update issue
- update the runbook immediately when the test exposes missing instructions

Done means BellField can be installed, opened from another machine or equivalent network client, used for office workflows, used by a field device, backed up, restored, and updated in a way that a pilot customer can reasonably understand.

---

## 9. Support Boundary

BellField should be honest about the support boundary.

Supported early:

- the approved Windows server profile
- BellField-created database and media storage
- BellField-provided install/update/backup procedure
- office browsers connecting to the server
- Android field app connecting through the documented secure access path

Not included by default:

- general PC repair
- unstable Wi-Fi or shop network troubleshooting beyond BellField requirements
- replacing the customer's backup discipline
- supporting arbitrary existing database servers
- making unsupported hardware reliable
- custom network/security projects without a paid setup scope

This boundary is important for pricing.
A local/self-hosted product can be profitable only if installation and support are controlled.

---

## 10. Milestone Fit

This work belongs primarily to Milestone 11, Self-Hosted Pilot Deployment.

Narrow prep may happen earlier when it prevents architectural mistakes, especially around:

- media root configuration
- backup/restore requirements
- service process assumptions
- environment variable handling
- Windows-friendly scripts
- logs and health checks

But BellField should not pause the active operational milestones to build a polished installer too early.
The right sequence is:

1. keep the operational core trustworthy
2. document the supported deployment shape
3. prove the install path internally
4. run an assisted paid pilot
5. only then consider broader self-service installation
