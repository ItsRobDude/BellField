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
