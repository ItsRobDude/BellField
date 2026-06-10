# BellField Sellable-Product Execution Plan

This is the controlling execution plan for taking BellField from "runs for
BellField's own shop" to "a stranger can buy it, install it on a Windows
office server, run it for years, and be supported."

It is grounded in a code audit performed 2026-06-10 (branch
`review-fixes-20260610`). Where this plan states "current reality," that was
verified against code, not assumed from docs.

Primary references:

- [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) — install posture and gates
- [asset-protection-and-licensing.md](./asset-protection-and-licensing.md) — licensing posture (decided)
- [delivery-relay-plan.md](./delivery-relay-plan.md) — relay design (decided)
- [launch-readiness.md](./launch-readiness.md) — the cross-cutting checklist this plan executes
- [customer-comms-and-delivery.md](./customer-comms-and-delivery.md) — comms phases

## How to use this plan

- Phases execute in order; slices inside a phase are ordered but may overlap
  when explicitly marked parallel-safe.
- Work the smallest slice that moves the phase gate. Do not start a later
  phase early just because it looks adjacent.
- Every slice lists acceptance criteria. A slice is not done until they pass.
- Decisions are tagged `D#` and collected in §Decisions; a slice that names a
  decision is blocked until that decision is recorded here.
- Product-feature work (invoice delivery, dispatch density, reporting polish)
  continues in parallel under
  [milestone-implementation-plan.md](./milestone-implementation-plan.md); this
  plan owns sellability infrastructure only.

## Current reality (audited 2026-06-10)

- No deployable artifact: no installer, Dockerfile, service registration, or
  release CI job. `apps/api` `start` runs `nest start` (dev toolchain at
  runtime); `apps/worker` runs via `tsx`.
- First-user paradox: with seeding off a fresh install has zero accounts and
  no way to create one; with `NODE_ENV` unset the API defaults to development
  and seeds owner logins with publicly-known `bellfield-*` passwords.
- Backup/restore: zero code. The `supportLogsBackups` permission gates a
  capability that does not exist.
- Update path: none. All versions are a frozen `0.0.1`; no release-date
  stamping, which the update-entitlement moat requires.
- Licensing: zero code; posture fully decided in
  `asset-protection-and-licensing.md`.
- `apps/worker`: a heartbeat stub — no DB access, no dependencies, no jobs.
- Live contradictions: CORS `origin: true` in all environments
  (`apps/api/src/main.ts`); nothing enforces that the interim Resend key stays
  off sold installs.
- Genuinely ready: the email adapter seam, outbound-message status vocabulary,
  and snapshot-at-queue-time semantics already match the relay plan.

---

## Phase 0 — Contradiction closures and relay prep

Small, independent code slices. No installer or licensing dependencies. All
can land on one branch.

### 0.1 Seed-data and dev-mode guard

Current: `runtime-config.ts` defaults `bootstrapSeedData` to true whenever
`NODE_ENV` is not `production`, and unset maps to `development`. Production
honors an explicit `BOOTSTRAP_SEED_DATA=true`.

Build:

- flip the default: seeding runs only when `BOOTSTRAP_SEED_DATA=true` is
  explicit, in every environment (`apps/api/src/common/config/runtime-config.ts`)
- production refuses to boot when `BOOTSTRAP_SEED_DATA=true` (aggregate it
  into the existing fail-fast problems list)
- add a System diagnostics check (`system-diagnostics.service.ts`): red when
  any active employee has a `@bellfield.local` email — seeded identities
  visible wherever they exist
- update `dev-setup.md` and both `.env.example`s: dev now sets
  `BOOTSTRAP_SEED_DATA=true` deliberately

Acceptance: API with no env vars boots with an empty employee table and a red
"seeded accounts" check never fires; production boot with seed flag set fails
with a readable error; existing dev flow documented and working.

### 0.2 Production CORS allowlist

Current: `app.enableCors({ origin: true })` unconditionally.

Build: new env `BELLFIELD_OFFICE_ORIGINS` (comma-separated). Production:
required, fail-fast when missing, exact-match allowlist. Dev/test: keep
permissive. Document in `.env.example` and `deployment-model.md`.

Acceptance: production boot without the var fails listing the problem;
cross-origin request from a non-listed origin is refused in production; dev
unchanged.

### 0.3 Structured delivery failure codes

Current: `EmailProviderSendResult` is `sent | notConfigured | error`, and
`estimate-delivery.service.ts` derives the public failure code by string
equality on adapter error copy — the one brittle joint in the relay seam.

Build: result becomes
`{ kind: 'sent', providerMessageId? } | { kind: 'failed', code: OutboundMessageFailureCode, retryable: boolean, message }`
(`notConfigured` folds into `code`). The service persists/derives codes from
the structured value; delete the string comparison. `retryable` is unused
until Phase 5 but defined now so the adapter contract is final.

Acceptance: existing delivery specs pass with assertions on structured codes;
no string-equality mapping remains.

### 0.4 Provider literal out of the call site

Current: `provider: 'resend'` hardcoded in `estimate-delivery.service.ts`.

Build: the adapter exposes its provider key; the service writes
`emailProviderService.providerKey`. Contracts/migration widening to `'relay'`
waits for Phase 5.

### 0.5 Shared attachment-size constant

Current: `15_000_000` inline in `estimate-delivery.service.ts`. A future
relay-side mismatch would strand queued sends for the full expiry window.

Build: `estimateEmailMaxAttachmentBytes` in `packages/contracts`
(document-delivery), consumed by the service; the relay spec references the
same constant.

### 0.6 Snapshot read path

Build: `CustomerDocumentStorageService.readEstimatePdf(storagePath, expectedSha256)`
— read, verify hash, return bytes. Converts snapshot-at-queue-time from
structurally-true to consumable by a deferred retry. Unit-test happy path and
hash mismatch.

### 0.7 Dedupe covers live queued rows

Current: the advisory-lock dedupe only blocks rows with
`queued_at >= now - 60s`. Under retry semantics an older live `queued` row no
longer blocks a duplicate send.

Build: in `createEstimateSendIntent`, any existing `queued` row for
(estimate, recipient) blocks regardless of age; `sent` rows keep the 60s
window. Conflict copy distinguishes "already queued" from "just sent."

Phase 0 gate: all slices merged, full suite green, no live contradiction
between code and `deployment-model.md` remains except the interim email key
(closed by Phase 5) and the artifact itself (Phase 1).

---

## Phase 1 — The installable artifact

Goal: one supported install path matching
`self-hosted-installation-strategy.md`. Customer never needs git, Node, pnpm,
Docker knowledge, or a terminal beyond running the installer.

### 1.1 First-admin setup flow (parallel-safe; pure product code)

Mechanic (boring, standard):

- at boot, if zero active employees exist, the API enters setup mode: it
  generates a one-time setup token, prints it to the server console/log only,
  and exposes exactly one unauthenticated endpoint:
  `POST /identity/setup/first-owner` accepting `{ setupToken, displayName,
email, password }`
- the endpoint creates an Owner-role employee and permanently exits setup mode
  (subsequent calls 404; mode never re-enters while any active employee exists)
- office-web: when the API reports setup mode (flag on an unauthenticated
  bootstrap/status response), the sign-in screen swaps to "Create the owner
  account" with a setup-token field
- rate-limit the endpoint; token is single-use; never render the token in any
  UI

Acceptance: fresh DB + no seed → operator copies token from the service log,
creates the owner in the browser, signs in; endpoint gone afterward; covered
by API spec + office test; works with seeding disabled end to end.

### 1.2 Production build outputs

Build:

- API: `nest build` → run `dist/` with `node`; prune devDependencies for the
  shipped layout; verify the estimating package builds into the artifact
- worker: replace `tsx` runtime with a `tsc` build + `node dist/index.js`
- office-web: `next build` with `output: 'standalone'` so the shipped app runs
  without the monorepo
- a `tools/build-release.mjs` that assembles `release/` containing the three
  built apps + a bundled Node runtime (no global Node required) — see D1

Acceptance: on a clean machine with nothing installed, the assembled
`release/` folder runs all three processes from compiled output.

### 1.3 Service registration

Decision D2 (service wrapper). Build: install-time registration of three
Windows services (api, worker, office-web) with restart-on-failure, log files
under the install directory, and correct start ordering (db → api → others).

Acceptance: reboot the machine; all services return; logs rotate or bound.

### 1.4 PostgreSQL provisioning

Decision D3. Recommended: bundle the user-space PostgreSQL 16 binaries the
repo's tooling already anticipates, initialized into the install directory and
registered as a service, with a generated (not default) password written to
the server config. Docker stays a dev-only path.

Acceptance: installer creates the instance and database on a machine with no
existing PostgreSQL; connection string lands in the unified config.

### 1.5 Unified server configuration

Build: one config file (e.g. `bellfield-server.env`) consumed by all three
services, written by the installer: DB connection, port, media root, media
token secret (generated), office origins (0.2), license file path (Phase 3),
relay settings (Phase 5). Replaces the four `.env.example`s for customers;
dev keeps its current flow.

### 1.6 Meaningful health endpoint

Current: `/health` returns static ok. Build: unauthenticated
`{ status: ok|degraded }` summarizing db reachability and pending-migration
state — status only, no details (details stay behind the authenticated System
surface). Used by service monitors and the installer's post-install check.

### 1.7 Migrations in the install/update path

Build: package the existing migration runner into the release; installer runs
it after DB provisioning; updater (Phase 4) runs it after laying files. The
API refuses to serve (clear error) when pending migrations exist — no
silent schema drift.

### 1.8 The installer and runbook

Decision D4 (installer technology). Build: an installer that lays the release,
writes config, provisions PostgreSQL, runs migrations, registers services,
performs the health check, and opens the browser to the first-admin setup
screen with instructions for retrieving the setup token. Plus
`docs/install-runbook.md`: install, verify, uninstall, move-to-new-server.

Phase 1 gate (the stranger test, per install-strategy): someone who has never
seen the repo installs BellField on a clean Windows machine using only the
installer and runbook, creates the owner, and books a job. Performed and
dated.

---

## Phase 2 — Backup and restore

Parallel-safe with late Phase 1. Includes the worker's job-runner substrate so
Phase 5 reuses it instead of inventing one.

### 2.1 Worker job-runner substrate

Build: give `apps/worker` a real footing — DB client, the unified config,
a minimal job loop (fixed-interval scheduling, per-job error isolation,
graceful shutdown). No queue tables, no generic framework; a boring loop the
backup job and (later) the delivery retry job both plug into.

Acceptance: worker runs a no-op job on schedule, survives a job throwing, and
shuts down cleanly as a service.

### 2.2 Scheduled backup job

Build: nightly (configurable) job producing a dated backup set: `pg_dump`
(custom format) + media-root copy, into a configured backup directory, with
retention (keep N). Record each run's outcome in a small table the System
surface can read.

### 2.3 Restore path and staleness visibility

Build: a packaged restore script (stop services → restore dump → restore
media → run migrations → start) + `docs/restore-runbook.md`; System surface
card showing last successful backup with red staleness warning past a
threshold; diagnostics check included in the rollup.

Phase 2 gate: a full restore drill onto a scratch machine succeeds from a real
backup set, performed and dated.

---

## Phase 3 — Licensing primitive

Consumed by the updater (Phase 4) and the relay (Phase 5). Design before code.

### 3.1 License design doc

Write `docs/license-design.md` pinning: signed license file format (JSON body +
signature; recommend Ed25519, public key embedded in the build), fields
(licenseId, shop name, issuedAt, updateWindowEnd, schema version), the
verification rules, and the explicit non-goals from
`asset-protection-and-licensing.md` §9 restated as constraints. The relay
credential is issued alongside the license but is a separate token — the
license file never contains relay secrets.

### 3.2 Runtime verification

Build: API boot loads and verifies the license file (path from unified
config). Refuse-to-start only when the file is missing or cryptographically
invalid. Expired update window, clock skew, offline, restored-to-new-machine:
all run. System surface shows licensee and update-window end. Dev/test builds
run unlicensed by build flag — sold builds require the file.

Acceptance: spec matrix covering valid / missing / tampered / expired-window /
future-dated files; tampered and missing refuse with readable errors; expired
window runs.

### 3.3 Issuance tooling (BellField-side)

Build: a private CLI (separate from the product) that generates keypairs,
issues license files, and records issued licenses (shop, licenseId, window).
One active license per shop is bookkeeping here and enforcement at the relay.

### 3.4 Relay credential issuance model

Define (doc-level now, service in Phase 5): per-shop relay token issued with
the license, delivered the same way, stored in the unified config, revocable
relay-side, single-active enforced relay-side.

Phase 3 gate: a sold-shaped build refuses to run without a valid license file
and runs forever with one, regardless of dates and connectivity.

---

## Phase 4 — Update channel

### 4.1 Release stamping

Build: CI release job producing the Phase-1 artifact with real version and
release date stamped into a build manifest; `readAppVersion()` reads the
manifest (not `package.json` at cwd); System surface and support bundle show
version + release date.

### 4.2 Distribution channel

Decision D6. Smallest viable: per-customer credentialed download (static
hosting + issued credentials tracked with the license). A portal is later
polish, not a launch need.

### 4.3 Updater

Build: updater (part of the installed product) that: verifies the new
artifact's signature, compares the artifact's release date to the license's
`updateWindowEnd` (refuses politely when outside — copy follows the
no-internal-leakage rule), takes an automatic pre-update backup (Phase 2
machinery), stops services, lays files, runs migrations, restarts, health
checks, and documents rollback (restore the pre-update backup).

Phase 4 gate: an installed v(N) machine updates to v(N+1) via the updater with
zero terminal use, and refuses a build dated past its window.

---

## Phase 5 — Delivery relay v1 and install integration

The relay service itself plus the install-side work. Controlling design:
[delivery-relay-plan.md](./delivery-relay-plan.md). Decision D7 (relay hosting
and codebase location) blocks the service work.

### 5.1 Relay service v1 (BellField-hosted)

Build, per the relay plan: license-token auth (3.4), narrow
`send estimate document` API (composes MIME itself; enforces the shared
attachment constant), per-shop usage metering (usage-based billing with
markup), quotas, suppression list, provider webhook termination, message
status endpoint, entitlement status endpoint, per-shop revocation,
bounce/complaint monitoring with autothrottle. Transient pass-through only —
no message-body storage.

### 5.2 Install adapter swap

Build: reimplement `EmailProviderService` as the relay client (same exported
types — Phase 0.3 made the contract final): send → relay send; readiness →
relay entitlement (extending `EstimateEmailDeliveryStatus` with
`quotaExhausted | suspended`, a non-breaking union extension; both UI
consumers already gate on the boolean). Config: relay base URL + token from
unified config; `BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY` deleted. Widen
`OutboundMessageProvider` with `'relay'` (contracts + migration relaxing the
check constraint), using the 0.4 provider key.

### 5.3 Queue schema and retry semantics

Build: migration adding `attempt_count`, `next_attempt_at`, `expires_at`
(queue + 24h), a `canceled` status, and a partial index on
`(status, next_attempt_at)`. Send flow: synchronous attempt first; on a
`retryable` failure (0.3) the intent stays `queued` with backoff scheduling
instead of `failed`. Decision D8: pin `fromName`/`replyToEmail` on the intent
row at queue time (recommended) so a retry hours later sends what the office
saw, not drifted settings.

### 5.4 Worker delivery jobs

Build on 2.1 substrate: retry job (due queued rows → snapshot via 0.6 → relay
send → mark sent/failed → timeline entry on eventual success), expiry sweep
(past `expires_at` → `failed` + timeline), and the status poller (relay poll →
`delivered`/`bounced`/`complained`; single status column for v1, accepting
that a bounce overwrites `sent` — the events table from
customer-comms-and-delivery §8 is a later refinement).

### 5.5 Office UI for queued sends

Build: third send-result branch — "Queued — will send automatically" (notice,
not error); queued history rows gain Cancel (new endpoint + repository
transition, permission `estimates:send`); panel refreshes/polls history while
a queued row exists; entitlement states surface on the panel and System card
with decided copy (open item in the relay plan).

Phase 5 gate: a sold-shaped install with only a license + relay token sends an
estimate end to end; relay outage during send queues, retries, succeeds, and
notifies; quota exhaustion blocks with safe copy; revocation cuts a shop off
without touching its server.

---

## Phase 6 — Acceptance links, then payment links

On the relay's host and auth, per customer-comms-and-delivery Phases 4–5.
Constraints already decided: acceptance records transit the relay until polled
(durable BellField receipt deferred); payment pages never touch card data or
shop processor keys — the shop's server creates processor-hosted checkout
sessions outbound, and payment confirmation follows webhook-at-relay /
poll-from-install. Detailed slicing happens when this phase opens.

---

## Decisions

| #   | Decision                                     | Recommendation                                                                | Status |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| D1  | Runtime packaging for the release artifact   | Compiled `dist/` per app + bundled Node runtime folder; no global installs    | open   |
| D2  | Windows service wrapper                      | A single vetted wrapper (e.g. WinSW-style) bundled by the installer           | open   |
| D3  | PostgreSQL provisioning on customer machines | Bundled user-space PG16, installer-initialized, generated password            | open   |
| D4  | Installer technology                         | Scripted installer (PowerShell-driven or Inno-style); decide at Phase 1 start | open   |
| D5  | Backup scheduling host                       | Worker job on the 2.1 substrate (shared with Phase 5), not OS scheduled tasks | open   |
| D6  | Update distribution channel                  | Per-customer credentialed download; portal later                              | open   |
| D7  | Relay hosting and codebase location          | Decide at Phase 5 start; affects nothing earlier                              | open   |
| D8  | Pin From identity at queue time              | Pin `fromName`/`replyToEmail` on the intent row                               | open   |

Earlier decisions already recorded elsewhere and binding here: relay-only key
custody, usage-based marked-up relay pricing, per-shop single-active license,
shop-fronted sender, subdomain-only custom domains, 24h queue expiry, deferred
acceptance receipts (`delivery-relay-plan.md`); license posture
(`asset-protection-and-licensing.md`).

## Standing verification

- every phase gate is performed and dated, not assumed
- the launch-readiness security review runs before the first pilot install
- the stranger-install test (Phase 1 gate) re-runs after Phase 4's first
  real update and after Phase 5's config changes
- `pnpm test` / lint / typecheck / architecture / file-size / ui-copy stay
  green per slice, as always
