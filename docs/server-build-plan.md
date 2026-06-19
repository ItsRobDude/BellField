# BellField Server Build Plan

This doc records the deployment-target correction made on 2026-06-18 and plans the two "legit server" builds. It is a planning doc, not an authorization to jump the milestone queue (see [milestone-implementation-plan.md](./milestone-implementation-plan.md)). Sequencing is a deliberate decision, made below.

## 1. The correction

BellField's deployment goal was always self-hosted on a **real server** for serious shops, packaged across three tiers:

- **Entry tier — single Windows PC** (exists today): one always-on Windows PC becomes the local server; assisted runbook install. Stays as the small-shop on-ramp.
- **Server build #1 — dedicated/headless Windows Server** (priority): unattended install, recoverable services, no interactive-desktop dependency, bundled Postgres + WinSW.
- **Server build #2 — Linux/Docker** (priority): containerized stack for a VM, VPS, or existing IT/virtualization infra; also the substrate for any future BellField-hosted option.

The guiding docs (`AGENTS.md`, `deployment-model.md`) had over-indexed on the single-reused-Windows-PC case and stated it as if it were the product. The **architecture was never wrong** — the install/deploy framing and its docs were. Those two docs are now realigned; remaining downstream docs are listed in §6.

## 2. What already carries over (the expensive part — done)

The application core is platform-neutral Node and transfers to #1 and #2 essentially untouched. Verified 2026-06-18:

- **Only one file in all of `apps/` has any OS coupling:** `apps/worker/src/jobs/backup/backup-service.ts`, and it merely shells out to `pg_dump` (cross-platform).
- **`packages/*` has zero OS coupling.**
- **Media already sits behind a storage abstraction** (`apps/api/src/modules/media/media-storage.service.ts`) — exactly the seam #2 needs.
- **The relay is already NestJS in Docker on Linux** — the containerized server pattern is already proven in this repo.
- Postgres migrations, money paths, contracts, validation, estimating, the full test suite → unchanged across tiers.
- The migration runner already supports both `node` (pg client) and `psql` drivers → works on Linux.
- The Windows install shell (`tools/install`: WinSW, NTFS ACLs, Postgres provisioning, the runbook) **transfers to #1** — Windows Server uses WinSW and ACLs the same way as Windows 11.

Net: the only genuinely new lane is **#2's container/deploy layer**, plus a small delta to harden #1.

## 3. Server build #1 — dedicated/headless Windows Server (small delta)

Building on the existing entry-tier install path:

- Bundle Postgres binaries + WinSW into the release (currently expected-to-be-staged and unvalidated — see `install-runbook.md` "Not yet validated").
- Unattended/headless install: no interactive desktop step; services auto-start and recover; run under a dedicated service account.
- Service recovery + reboot persistence proof.
- Execute the clean-machine gate on a Windows Server target (see §5).

## 4. Server build #2 — Linux/Docker (the real new lane)

Mostly a deploy layer; reuse the relay's Dockerfile/compose pattern.

- **Container images:** multi-stage Node builds for `api`, `worker`, `office-web` (office-web already builds as a Next standalone server).
- **Orchestration:** compose (or Helm later) wiring app containers + Postgres (containerized for simple installs, or external/managed PG for serious infra) + a media volume.
- **Config:** already env-driven via the `bellfield-server.env` variables. Audit for any Windows-path assumptions; ensure every path is configurable and POSIX-friendly.
- **Media storage:** today local FS behind `media-storage.service.ts`. Minimal first step = a mounted volume; scalable step = an object-storage adapter (S3/MinIO) behind the existing abstraction. The abstraction means this is an adapter, not a rewrite.
- **Backup job:** audit `backup-service.ts` runs in a Linux container — `pg_dump` present in the image, POSIX paths. This is the **one** app file that needs OS attention.
- **Service management:** container restart policy / systemd instead of WinSW.
- **Health/observability:** `/health` already exists; add a container `HEALTHCHECK`.
- **TLS/ingress:** reverse proxy (Caddy/Traefik/nginx) in front. Remote-access story (relay + BYO-Tailscale) already documented in [remote-access-plan.md](./remote-access-plan.md).

## 5. Sequencing and the clean-machine gate

Do **not** run multiple unproven install paths in parallel. Recommended order:

1. **Prove the entry tier first** — it is closest to done; finish the existing clean-machine gate (a dev-tool-free Windows VM, snapshot-based, with the office-side check from a second browser off-localhost). This validates the shared install mechanics (migrations, backup, restore, update, first-owner, service install, ACLs).
2. **Then build #2 (Linux/Docker)** as the first true server build. It is the most **CI-validatable** — a pipeline can build the images and boot the whole stack on every change, turning the "clean machine" proof into automation rather than a one-time manual event. It is also the strategically central target (modern IT/MSP deployment, lowest customer licensing cost, hosted-tier substrate).
3. **Then #1 (Windows Server)** as a packaging of the now-proven server stack for Windows-Server shops, reusing most of the entry-tier install shell.

This order is provisional on the buyer question in §7. If the immediate paying customer is a Windows-shop-with-IT, #1 may jump ahead of #2.

## 6. Downstream docs to realign (follow-up, not done here)

These still assume the single-Windows-PC model and should be updated when the relevant build lands (per the "sync all status docs" rule):

- `self-hosted-installation-strategy.md`
- `install-runbook.md` (add #1 bundling steps; add a #2 container runbook)
- `launch-readiness.md`
- `gate-day-checklist.md`
- `repo-map.md`
- `milestone-implementation-plan.md` / `sellable-product-execution-plan.md` (slot the server-build lane)
- `remote-access-plan.md` (ingress/TLS for server tiers)

## 7. Open questions for Rob

- **Which serious-shop buyer comes first** — Windows-shop-with-real-server (#1), or modern/Linux/VM/MSP (#2)? This sets the §5 order.
- **Media in #2:** mounted volume (simple) or object storage (scalable) for the first cut? (See §8 — a future hosted tier nudges toward object storage.)

## 8. Future hosted SaaS (deferred — confirmed 2026-06-18)

Rob plans a hosted SaaS version eventually; it is deliberately deferred, not on the current plate. Do **not** build it now. The only job today is to avoid foreclosing it cheaply.

Recommended model: **isolated instance per tenant — database-per-tenant, container-per-tenant.** The hosted product is "BellField runs the same self-hosted stack, one isolated instance per customer, on BellField infra." This fits the data-ownership identity (each customer's data stays in its own database), makes onboarding/offboarding and per-customer backup/restore clean, and — critically — is what a self-hosted install already _is_ (N=1). Shared-database row-level tenancy (`tenant_id` on every table) is the opposite path and would be brutal to retrofit onto the existing schema, repositories, and 160+ migrations; for a B2B FSM tool with modest tenant counts it buys nothing.

What this means now (all cheap, mostly non-actions):

- **Keep every install a clean single-tenant unit.** Do not bolt on a premature shared-tenant `tenant_id` model. Single-tenant is the door-open position, not the limitation.
- When #2 is built, make its two forward-looking choices SaaS-friendly anyway: **env-driven provisioning with no interactive install step** (so instances can be spun up programmatically) and **an object-storage media adapter** behind the existing `media-storage.service.ts` seam (per-tenant prefixes/buckets later).
- Everything else — the control plane (provisioning, subdomain routing, metering/billing), tenant lifecycle, hosted licensing posture — is genuinely net-new and safely deferred. It is not foreclosed by anything in #1 or #2.
